import { Router } from 'express';
import bcrypt from "bcryptjs";
import { prisma } from '../lib/prisma.js';
import { DEFAULT_USER_NOTIFICATIONS, toPublicUser } from '../lib/serializers.js';
import { authenticateToken, requireUser } from '../middleware/auth.js';

const router = Router();

//=============================================================== CONTA DO CLIENTE (página Account)
// Tudo aqui é do próprio cliente logado (/users/me/...). Nome, telefone e data
// de nascimento ficam no PUT /users/me (routes/users.js).

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // o bcrypt ignora o que passa de 72 bytes
const MAX_ADDRESSES = 10;
const MAX_AVATAR_CHARS = 90_000; // o express.json() aceita no máximo ~100 KB por requisição
const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const isObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id));
const text = (value) => (value === undefined || value === null ? "" : String(value).trim());

function handleError(res, error, fallback) {
  if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: fallback });
}

//------------------------------------------------------------- PATCH ROUTE (trocar a senha - exige a senha atual)
router.patch('/users/me/password', authenticateToken, requireUser, async (req, res) => {
  try {
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";

    if (!currentPassword || !newPassword) {
      throw new InputError("Informe a senha atual e a nova senha.");
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new InputError(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new InputError(`A nova senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`);
    }
    if (newPassword === currentPassword) {
      throw new InputError("A nova senha deve ser diferente da atual.");
    }

    const customer = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!customer) throw new InputError("Cliente não encontrado.", 404);

    const matches = await bcrypt.compare(currentPassword, customer.password);
    if (!matches) throw new InputError("Senha atual incorreta.");

    await prisma.user.update({
      where: { id: customer.id },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });

    res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    handleError(res, error, "Erro ao alterar senha.");
  }
});

//------------------------------------------------------------- NOTIFICAÇÕES (preferências)
router.get('/users/me/notifications', authenticateToken, requireUser, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!customer) throw new InputError("Cliente não encontrado.", 404);
    res.json(toPublicUser(customer).notificationPrefs);
  } catch (error) {
    handleError(res, error, "Erro ao buscar preferências.");
  }
});

router.put('/users/me/notifications', authenticateToken, requireUser, async (req, res) => {
  try {
    const incoming = req.body && typeof req.body === "object" ? req.body : {};
    const changes = {};

    for (const key of Object.keys(DEFAULT_USER_NOTIFICATIONS)) {
      if (incoming[key] === undefined) continue;
      if (typeof incoming[key] !== "boolean") throw new InputError(`Valor inválido para "${key}".`);
      changes[key] = incoming[key];
    }

    const customer = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!customer) throw new InputError("Cliente não encontrado.", 404);

    const updated = await prisma.user.update({
      where: { id: customer.id },
      data: { notificationPrefs: { ...DEFAULT_USER_NOTIFICATIONS, ...(customer.notificationPrefs || {}), ...changes } },
    });
    res.json(toPublicUser(updated).notificationPrefs);
  } catch (error) {
    handleError(res, error, "Erro ao salvar preferências.");
  }
});

//------------------------------------------------------------- FOTO DE PERFIL
// O front manda uma miniatura JPEG já reduzida (256px) como data URL. É uma
// solução simples: a imagem fica no próprio documento do cliente. Quando
// houver uma API de upload, só `avatarUrl` passa a receber a URL do arquivo.
router.put('/users/me/avatar', authenticateToken, requireUser, async (req, res) => {
  try {
    const image = typeof req.body.image === "string" ? req.body.image : "";
    const prefix = "data:image/jpeg;base64,";

    if (!image.startsWith(prefix)) throw new InputError("Envie a foto em JPEG.");
    if (image.length > MAX_AVATAR_CHARS) throw new InputError("A foto é grande demais. Escolha outra.", 413);

    const base64 = image.slice(prefix.length);
    // além do formato, confere a "assinatura" de um JPEG de verdade (FF D8 FF)
    const signature = Buffer.from(base64.slice(0, 8), "base64");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
      throw new InputError("Imagem inválida.");
    }

    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: image } });
    res.json(toPublicUser(updated, { includeAvatar: true }));
  } catch (error) {
    handleError(res, error, "Erro ao salvar a foto.");
  }
});

router.delete('/users/me/avatar', authenticateToken, requireUser, async (req, res) => {
  try {
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } });
    res.json(toPublicUser(updated, { includeAvatar: true }));
  } catch (error) {
    handleError(res, error, "Erro ao remover a foto.");
  }
});

//------------------------------------------------------------- ENDEREÇOS
function parseAddress(body) {
  const zipCode = text(body.zipCode).replace(/\D/g, "");
  if (zipCode.length !== 8) throw new InputError("CEP inválido. Informe 8 números.");

  const street = text(body.street);
  const number = text(body.number);
  const neighborhood = text(body.neighborhood);
  const city = text(body.city);
  const state = text(body.state).toUpperCase();
  const complement = text(body.complement);
  const label = text(body.label);

  if (!street) throw new InputError("Informe a rua.");
  if (!number) throw new InputError("Informe o número (ou S/N).");
  if (!neighborhood) throw new InputError("Informe o bairro.");
  if (!city) throw new InputError("Informe a cidade.");
  if (!UFS.includes(state)) throw new InputError("Estado (UF) inválido.");
  if ([street, neighborhood, city].some((v) => v.length > 100) || number.length > 20 || complement.length > 60 || label.length > 30) {
    throw new InputError("Algum campo do endereço está grande demais.");
  }

  return {
    zipCode,
    street,
    number,
    neighborhood,
    city,
    state,
    complement: complement || null,
    label: label || null,
  };
}

// principal primeiro; depois o mais recente
const sortAddresses = (list) =>
  [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || new Date(b.createdAt) - new Date(a.createdAt));

async function findOwnAddress(client, id, userId) {
  if (!isObjectId(id)) throw new InputError("Endereço não encontrado.", 404);
  const address = await client.address.findFirst({ where: { id, userId } });
  if (!address) throw new InputError("Endereço não encontrado.", 404);
  return address;
}

router.get('/users/me/addresses', authenticateToken, requireUser, async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({ where: { userId: req.user.id } });
    res.json(sortAddresses(addresses));
  } catch (error) {
    handleError(res, error, "Erro ao buscar endereços.");
  }
});

router.post('/users/me/addresses', authenticateToken, requireUser, async (req, res) => {
  try {
    const data = parseAddress(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.address.count({ where: { userId: req.user.id } });
      if (existing >= MAX_ADDRESSES) throw new InputError(`Você pode ter no máximo ${MAX_ADDRESSES} endereços.`);

      // o primeiro endereço é sempre o principal; nos demais, só se o cliente pedir
      const makeDefault = existing === 0 || req.body.isDefault === true;
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId: req.user.id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { ...data, isDefault: makeDefault, userId: req.user.id } });
    });

    res.status(201).json(created);
  } catch (error) {
    handleError(res, error, "Erro ao salvar endereço.");
  }
});

router.put('/users/me/addresses/:id', authenticateToken, requireUser, async (req, res) => {
  try {
    const data = parseAddress(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const address = await findOwnAddress(tx, req.params.id, req.user.id);
      const makeDefault = req.body.isDefault === true && !address.isDefault;
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId: req.user.id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id: address.id }, data: { ...data, ...(makeDefault ? { isDefault: true } : {}) } });
    });

    res.json(updated);
  } catch (error) {
    handleError(res, error, "Erro ao atualizar endereço.");
  }
});

router.patch('/users/me/addresses/:id/default', authenticateToken, requireUser, async (req, res) => {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const address = await findOwnAddress(tx, req.params.id, req.user.id);
      await tx.address.updateMany({ where: { userId: req.user.id, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id: address.id }, data: { isDefault: true } });
    });
    res.json(updated);
  } catch (error) {
    handleError(res, error, "Erro ao definir endereço principal.");
  }
});

router.delete('/users/me/addresses/:id', authenticateToken, requireUser, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      const address = await findOwnAddress(tx, req.params.id, req.user.id);
      await tx.address.delete({ where: { id: address.id } });

      // apagou o principal: o mais recente dos que sobraram assume
      if (address.isDefault) {
        const [next] = sortAddresses(await tx.address.findMany({ where: { userId: req.user.id } }));
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    res.json({ message: "Endereço removido." });
  } catch (error) {
    handleError(res, error, "Erro ao remover endereço.");
  }
});

export default router;
