import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ACCESS_TOKEN_KEY } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { DEFAULT_STAFF_SETTINGS, toPublicStaff } from '../lib/serializers.js';
import { authenticateToken, requireMajorAdmin, requireStaff, stockAuth } from '../middleware/auth.js';
import { broadcastAppointmentsChanged } from '../lib/realtime.js';

const router = Router();

//------------------------------------------------------------- FOTO DE PERFIL (funcionária edita a própria)
// O front recorta a foto e manda um JPEG (multipart, campo "file"). Gravamos em
// <UPLOAD_DIR>/avatars e guardamos só o caminho público (/uploads/avatars/...).
// Pressupõe que /uploads já é servido como estático (o mesmo das fotos dos clientes).
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES } });

const isJpeg = (buf) => buf?.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

// apaga o arquivo antigo (só os que esta rota criou: prefixo "staff-")
async function removeAvatarFile(avatarUrl) {
  if (!avatarUrl) return;
  const name = path.basename(String(avatarUrl));
  if (!name.startsWith('staff-')) return;
  await fs.unlink(path.join(AVATAR_DIR, name)).catch(() => {});
}

router.put('/staff/me/avatar', authenticateToken, requireStaff, (req, res) => {
  avatarUpload.single('file')(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'A foto passa de 2 MB.' : 'Não foi possível ler a foto enviada.' });
      }
      if (!req.file || !isJpeg(req.file.buffer)) {
        return res.status(400).json({ error: 'Envie a foto em JPEG.' });
      }

      const me = await prisma.staff.findUnique({ where: { id: req.user.id } });
      if (!me) return res.status(401).json({ error: 'Sessão expirada.' });

      await fs.mkdir(AVATAR_DIR, { recursive: true });
      const fileName = `staff-${me.id}-${Date.now()}.jpg`;
      await fs.writeFile(path.join(AVATAR_DIR, fileName), req.file.buffer);

      const updated = await prisma.staff.update({
        where: { id: me.id },
        data: { avatarUrl: `/uploads/avatars/${fileName}` },
      });
      await removeAvatarFile(me.avatarUrl);

      res.status(200).json(toPublicStaff(updated));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao salvar a foto.' });
    }
  });
});

router.delete('/staff/me/avatar', authenticateToken, requireStaff, async (req, res) => {
  try {
    const me = await prisma.staff.findUnique({ where: { id: req.user.id } });
    if (!me) return res.status(401).json({ error: 'Sessão expirada.' });

    const updated = await prisma.staff.update({ where: { id: me.id }, data: { avatarUrl: null } });
    await removeAvatarFile(me.avatarUrl);

    res.status(200).json(toPublicStaff(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover a foto.' });
  }
});

//------------------------------------------------------------- POST ROUTE (CREATE STAFF - só MajorAdmin)
// Antes essa rota não exigia login: qualquer um criava uma conta de equipe (inclusive MajorAdmin).
router.post('/staff', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const staff = await prisma.staff.create({
      data: {
        email: req.body.email,
        name: req.body.name,
        password: hashedPassword,
        phone: req.body.phone,
        role: req.body.role,
        birthdate: new Date(req.body.birthdate),
      }
    })

    res.status(201).json(toPublicStaff(staff))

  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: error.message
    })
  }
})

//------------------------------------------------------------- POST ROUTE (LOGIN STAFF)
router.post('/auth/staff/login', async (req, res) => {
  try {
    const { email, password, rememberUser } = req.body;

    const staff = await prisma.staff.findUnique({ where: { email } });

    // mesma mensagem tanto pra email inexistente quanto senha errada,
    // pra não dar dica de quais emails existem no banco
    if (!staff) {
      return res.status(403).json({ error: "Email ou senha inválidos." });
    }

    const passwordMatches = await bcrypt.compare(password, staff.password);
    if (!passwordMatches) {
      return res.status(403).json({ error: "Email ou senha inválidos." });
    }

    // conta inativada não entra mais
    if (staff.status === "Inactive") {
      return res.status(403).json({ error: "Conta inativa." });
    }

    const token = jwt.sign(
      { id: staff.id, email: staff.email, type: "staff" },
      ACCESS_TOKEN_KEY,
      { expiresIn: rememberUser ? "30d" : "24h" }
    );

    res.json({ token, staff: toPublicStaff(staff) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao fazer login." });
  }
});

//------------------------------------------------------------- GET ROUTE (STAFF LOGADO)
router.get('/auth/staff/me', authenticateToken, requireStaff, async (req, res) => {
  try {
    const staff = await prisma.staff.findUnique({ where: { id: req.user.id } });

    if (!staff) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    res.json(toPublicStaff(staff));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar usuário." });
  }
});

//------------------------------------------------------------- GET ROUTE (só equipe - clientes não listam a equipe)
// MajorAdmin recebe o cadastro completo (email, telefone, nascimento...). As demais só
// recebem id, nome, cargo e status - o suficiente pro seletor de profissional.
router.get('/staff', ...stockAuth, async (req, res) => {
  try {
    const isAdmin = req.staff.role === "MajorAdmin";
    const hasFilters = req.query && Object.keys(req.query).length > 0;

    const staff = hasFilters
      ? await prisma.staff.findMany({
          where: {
            name: req.query.name,
            email: req.query.email
          }
        })
      : await prisma.staff.findMany();

    res.status(200).json(
      isAdmin
        ? staff.map(toPublicStaff)
        : staff.map(({ id, name, role, status }) => ({ id, name, role, status }))
    )
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching staff." });
  }
})

//------------------------------------------------------------- PUT ROUTE (protected)
router.put('/staff/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { id } = req.params;

    // busca a role atual do requisitante direto no banco -
    // não confia em role vinda do JWT, que pode estar desatualizada
    const requester = await prisma.staff.findUnique({ where: { id: req.user.id } });
    if (!requester) {
      return res.status(401).json({ error: "Sessão expirada." });
    }

    const isAdmin = requester.role === "MajorAdmin";
    const isSelf = requester.id === id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: "Você só pode editar o seu próprio perfil." });
    }

    const { name, email, password, phone, role, status, birthdate, settings } = req.body;

    const data = { name, email, phone };

    // preferências pessoais - não são sensíveis como role/status, então
    // qualquer staff editando o próprio perfil pode mudar isso. Merge raso:
    // manda só a chave que mudou (ex: { dragAppointments: true }) e as
    // outras preferências já salvas continuam intactas.
    if (settings !== undefined) {
      data.settings = { ...DEFAULT_STAFF_SETTINGS, ...(requester.settings || {}), ...settings };
    }

    // role e status só podem ser alterados por admin - mesmo que um
    // usuário comum edite o próprio perfil, esses campos são ignorados
    if (isAdmin) {
      data.role = role;
      data.status = status;
    }

    if (birthdate) {
      data.birthdate = new Date(birthdate);
    }

    // só troca a senha se o admin/usuário realmente digitou uma nova;
    // campo vazio = manter a senha atual
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const updatedStaff = await prisma.staff.update({
      where: { id }, // ObjectId do Mongo é string, não Number
      data,
    });

    return res.status(200).json(toPublicStaff(updatedStaff));
  } catch (error) {
    console.error(error);

    // P2002 = violação de campo único (email já cadastrado em outro staff)
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Este email já está em uso." });
    }

    return res.status(500).json({
      message: "Error updating user.",
    });
  }
});

//------------------------------------------------------------- AVAILABILITY (protected)
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// dia 0-6, horário HH:mm, fim > início, sem sobreposição no mesmo dia
function validateAvailability(list) {
  if (!Array.isArray(list)) return "availability deve ser uma lista.";

  const byDay = {};
  for (const item of list) {
    const { weekday, startTime, endTime } = item || {};
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return "Dia da semana inválido.";
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return "Horário inválido (use HH:mm).";
    if (endTime <= startTime) return "O fim precisa ser depois do início.";
    (byDay[weekday] ||= []).push({ startTime, endTime });
  }

  for (const intervals of Object.values(byDay)) {
    intervals.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].startTime < intervals[i - 1].endTime) return "Horários sobrepostos no mesmo dia.";
    }
  }
  return null;
}

const listAvailability = (staffId) =>
  prisma.staffAvailability.findMany({
    where: { staffId },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });

// só a própria funcionária ou o MajorAdmin acessam a agenda -
// role lida do banco, como no PUT acima
async function canManageAvailability(req) {
  const requester = await prisma.staff.findUnique({ where: { id: req.user.id } });
  if (!requester) return false;
  return requester.role === "MajorAdmin" || requester.id === req.params.id;
}

router.get('/staff/:id/availability', authenticateToken, requireStaff, async (req, res) => {
  try {
    if (!(await canManageAvailability(req))) {
      return res.status(403).json({ error: "Sem permissão para ver esta disponibilidade." });
    }

    res.status(200).json(await listAvailability(req.params.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
});

// substitui a agenda inteira pelo que veio no body
router.put('/staff/:id/availability', authenticateToken, requireStaff, async (req, res) => {
  try {
    if (!(await canManageAvailability(req))) {
      return res.status(403).json({ error: "Sem permissão para editar esta disponibilidade." });
    }

    const { availability } = req.body;
    const validationError = validateAvailability(availability);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const staffId = req.params.id;

    // sem $transaction: Mongo só aceita transação em replica set
    // (Atlas aceita; se o seu for local standalone, não)
    await prisma.staffAvailability.deleteMany({ where: { staffId } });
    if (availability.length > 0) {
      await prisma.staffAvailability.createMany({
        data: availability.map(({ weekday, startTime, endTime }) => ({
          staffId,
          weekday,
          startTime,
          endTime,
        })),
      });
    }

    res.status(200).json(await listAvailability(staffId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar disponibilidade." });
  }
});

//------------------------------------------------------------- WORKLOAD (o que ainda está vinculado a uma funcionária)
// Sessões futuras (Agendada/Confirmada) e procedimentos em que ela é a responsável.
const pendingWhere = (staffId) => ({
  professionalId: staffId,
  status: { in: ["Scheduled", "Confirmed"] },
  endDate: { gte: new Date() },
});

async function getStaffWorkload(staffId) {
  const [futureAppointments, services] = await Promise.all([
    prisma.appointment.count({ where: pendingWhere(staffId) }),
    prisma.service.count({ where: { professionalId: staffId } }),
  ]);
  return { futureAppointments, services };
}

// A tela de equipe consulta isto ANTES de excluir: se houver trabalho vinculado,
// abre o modal pra escolher quem vai receber.
router.get('/staff/:id/workload', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const target = await prisma.staff.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) return res.status(404).json({ error: "Funcionária não encontrada." });
    res.json(await getStaffWorkload(target.id));
  } catch (error) {
    if (error.code === "P2023") return res.status(404).json({ error: "Funcionária não encontrada." });
    console.error(error);
    res.status(500).json({ error: "Erro ao verificar as sessões da funcionária." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (só MajorAdmin)
// Antes qualquer token válido (até de cliente) apagava qualquer funcionária.
//
// Excluir uma funcionária que ainda tem trabalho vinculado deixaria sessões e procedimentos
// sem profissional (e eles sumiriam das agendas). Por isso:
// - sem sessões futuras nem procedimentos: exclui normalmente;
// - com algum deles: responde 409 e só exclui se vier ?transferTo=<id de outra funcionária
//   ativa> (escolhida pelo MajorAdmin no modal). Aí as sessões futuras e os procedimentos
//   passam pra ela e a exclusão segue, tudo na mesma transação.
// - o histórico passado (sessões já realizadas/canceladas) fica com o NOME da ex-funcionária
//   guardado em Appointment.professionalName, já que professionalId vira nulo.
router.delete('/staff/:id', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const transferTo = req.query.transferTo ? String(req.query.transferTo) : null;

    if (id === req.staff.id) {
      return res.status(400).json({ error: "Você não pode excluir a própria conta." });
    }

    const target = await prisma.staff.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!target) {
      return res.status(404).json({ error: "Funcionária não encontrada." });
    }

    const { futureAppointments, services } = await getStaffWorkload(id);
    const hasWork = futureAppointments > 0 || services > 0;

    if (hasWork) {
      if (!transferTo) {
        return res.status(409).json({
          error: `${target.name} ainda tem ${futureAppointments} sessão(ões) futura(s) e ${services} procedimento(s). Transfira para outra profissional antes de excluir.`,
          code: "STAFF_HAS_WORK",
          futureAppointments,
          services,
        });
      }
      if (transferTo === id) {
        return res.status(400).json({ error: "Escolha outra profissional para receber a transferência." });
      }
      const receiver = await prisma.staff.findUnique({ where: { id: transferTo }, select: { id: true, status: true } });
      if (!receiver || receiver.status !== "Active") {
        return res.status(400).json({ error: "A profissional escolhida não existe ou não está ativa." });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (hasWork) {
        await tx.appointment.updateMany({ where: pendingWhere(id), data: { professionalId: transferTo } });
        await tx.service.updateMany({ where: { professionalId: id }, data: { professionalId: transferTo } });
      }
      // o que sobrar com o id dela é histórico: guarda o nome antes do vínculo se perder
      await tx.appointment.updateMany({ where: { professionalId: id }, data: { professionalName: target.name } });
      await tx.staff.delete({ where: { id } }); // ObjectId do Mongo é string, não Number
    });

    broadcastAppointmentsChanged();
    res.status(200).json({ message: "Funcionária removida com sucesso." });
  } catch (error) {
    if (error.code === "P2025" || error.code === "P2023") {
      return res.status(404).json({ error: "Funcionária não encontrada." });
    }
    // P2003/P2014: ainda há registros presos a ela (ex: histórico de estoque) - o certo é inativar a conta
    if (error.code === "P2003" || error.code === "P2014") {
      return res.status(409).json({
        error: "Esta funcionária tem histórico (ex: movimentações de estoque) e não pode ser excluída. Inative a conta em vez de excluir.",
      });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover funcionária." });
  }
});

export default router;
