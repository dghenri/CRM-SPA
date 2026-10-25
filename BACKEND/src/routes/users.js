import { Router } from 'express';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ACCESS_TOKEN_KEY } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { toPublicUser } from '../lib/serializers.js';
import { MIN_AGE_MESSAGE, duplicateFieldMessage, isUnderMinAge, isValidCpf } from '../lib/validators.js';
import { authenticateToken, requirePermission, requireStaff, requireUser, stockAuth } from '../middleware/auth.js';
import { loadStaffActor, scopeWhere } from '../lib/appointmentAccess.js';
import { grantWelcomeCoupon } from '../services/welcomeCoupon.js';
import { validatePassword } from '../lib/passwordPolicy.js';

const router = Router();

//=============================================================== USERS (CLIENTES)

//------------------------------------------------------------- POST ROUTE (cadastro de cliente - público)
// Progressive Profiling: a primeira etapa do cadastro só exige o essencial
// (nome, CPF, email e senha). Telefone, gênero e data de nascimento são
// completados depois, via PUT /users/me, já com a conta criada.
router.post('/auth/user/register', async (req, res) => {
  try {
    const { email, name, password, cpf } = req.body;
    const cpfDigits = (cpf || "").replace(/\D/g, "");

    if (!email?.trim() || !name?.trim() || !password || !cpfDigits) {
      return res.status(400).json({ error: "Preencha nome, CPF, email e senha." });
    }

    if (!isValidCpf(cpfDigits)) {
      return res.status(400).json({ error: "CPF inválido." });
    }

    // senha forte (mesma regra do checklist do cadastro no front)
    const passwordProblems = validatePassword(password, { name, email });
    if (passwordProblems.length) {
      return res.status(400).json({ error: passwordProblems[0], problems: passwordProblems });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const customer = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        cpf: cpfDigits,
        password: hashedPassword,
      },
    });

    // cupom de boas-vindas (BEMVINDO30) já na carteira do cliente novo. Se falhar
    // por qualquer motivo, o cadastro continua valendo - o cupom não pode
    // impedir ninguém de criar a conta.
    try {
      await grantWelcomeCoupon(customer.id);
    } catch (couponError) {
      console.error("Falha ao entregar cupom de boas-vindas:", couponError);
    }

    res.status(201).json(toPublicUser(customer));
  } catch (error) {
    // e-mail ou CPF duplicado (constraint @unique)
    if (error.code === "P2002") {
      return res.status(409).json({ error: duplicateFieldMessage(error) });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao cadastrar cliente." });
  }
});

//------------------------------------------------------------- POST ROUTE (login de cliente)
router.post('/auth/user/login', async (req, res) => {
  try {
    const { email, password, rememberUser } = req.body;

    // mesmo formato do GET /users/me (com favoritos): o AuthContext guarda o que vier daqui
    const customer = await prisma.user.findUnique({ where: { email }, include: { favoriteServices: true } });

    // mesma mensagem tanto pra email inexistente quanto senha errada
    if (!customer) {
      return res.status(403).json({ error: "Email ou senha inválidos." });
    }

    const passwordMatches = await bcrypt.compare(password, customer.password);
    if (!passwordMatches) {
      return res.status(403).json({ error: "Email ou senha inválidos." });
    }

    // marca o login pra depois dar pra identificar contas inativas
    // (lastLogin nulo ou muito antigo). Feito antes de assinar o token, mas
    // sem bloquear a resposta em caso de falha nessa atualização pontual.
    const loginAt = new Date();
    try {
      await prisma.user.update({
        where: { id: customer.id },
        data: { lastLogin: loginAt },
      });
    } catch (updateError) {
      console.error("Falha ao atualizar lastLogin:", updateError);
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email, type: "user" },
      ACCESS_TOKEN_KEY,
      { expiresIn: rememberUser ? "30d" : "24h" }
    );

    // includeAvatar: sem isso a foto só aparecia depois de recarregar a página (GET /users/me)
    res.json({ token, user: toPublicUser({ ...customer, lastLogin: loginAt }, { includeAvatar: true }) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao fazer login." });
  }
});

//------------------------------------------------------------- GET ROUTE (perfil do cliente logado)
router.get('/users/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { favoriteServices: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    res.json(toPublicUser(customer, { includeAvatar: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

//------------------------------------------------------------- PUT ROUTE (cliente edita o próprio perfil / completa o cadastro depois)
// Senha NÃO passa por aqui: use PATCH /users/me/password (exige a senha atual).
router.put('/users/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const { name, email, gender, phone, birthdate } = req.body;

    // O CPF identifica o cliente (e protege contra cadastro duplicado): o próprio
    // cliente não troca. Se estiver errado, ele fala com o suporte e a equipe
    // corrige em PUT /users/:id.
    if (req.body.cpf !== undefined) {
      return res.status(400).json({ error: "O CPF não pode ser alterado por aqui. Entre em contato com o suporte." });
    }

    if (req.body.password !== undefined) {
      return res.status(400).json({ error: "Para trocar a senha use PATCH /users/me/password." });
    }

    const data = {};

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (cleanName.length < 2 || cleanName.length > 100) {
        return res.status(400).json({ error: "Informe um nome com 2 a 100 caracteres." });
      }
      data.name = cleanName;
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: "E-mail inválido." });
      }

      // Trocar o e-mail muda o login da conta: só com a senha atual (protege
      // contra alguém que pegou o celular do cliente já logado)
      const customer = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!customer) return res.status(404).json({ error: "Cliente não encontrado." });

      if (cleanEmail !== String(customer.email).toLowerCase()) {
        const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
        if (!currentPassword) {
          return res.status(400).json({ error: "Para alterar o e-mail, informe sua senha atual." });
        }
        if (!(await bcrypt.compare(currentPassword, customer.password))) {
          return res.status(400).json({ error: "Senha atual incorreta." });
        }
        const taken = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (taken && taken.id !== customer.id) {
          return res.status(409).json({ error: "Este e-mail já está em uso." });
        }
        data.email = cleanEmail;
      }
    }

    // gênero: só os valores do enum Gender; vazio apaga
    if (gender !== undefined) {
      if (gender === null || gender === "") {
        data.gender = null;
      } else if (!["Male", "Female", "Other", "PreferNotToSay"].includes(gender)) {
        return res.status(400).json({ error: "Gênero inválido." });
      } else {
        data.gender = gender;
      }
    }

    // telefone: guarda como o front enviou (ex: "(71) 99999-9999") e só confere
    // se tem 10 ou 11 dígitos. Vazio = apaga o telefone.
    if (phone !== undefined) {
      const rawPhone = phone === null ? "" : String(phone).trim();
      if (rawPhone === "") {
        data.phone = null;
      } else {
        const digits = rawPhone.replace(/\D/g, "");
        if (!/^[\d\s()+\-]+$/.test(rawPhone) || rawPhone.length > 20 || (digits.length !== 10 && digits.length !== 11)) {
          return res.status(400).json({ error: "Telefone inválido. Informe DDD + número." });
        }
        data.phone = rawPhone;
      }
    }

    // Progressive Profiling: é por aqui que o cliente completa o cadastro depois
    // (telefone, gênero e data de nascimento), já com a conta criada.

    if (birthdate !== undefined) {
      if (birthdate === null || birthdate === "") {
        data.birthdate = null;
      } else {
        const parsedBirthdate = new Date(birthdate);
        if (Number.isNaN(parsedBirthdate.getTime()) || parsedBirthdate > new Date() || parsedBirthdate.getUTCFullYear() < 1900) {
          return res.status(400).json({ error: "Data de nascimento inválida." });
        }
        if (isUnderMinAge(parsedBirthdate)) {
          return res.status(400).json({ error: MIN_AGE_MESSAGE });
        }
        data.birthdate = parsedBirthdate;
      }
    }

    const updatedCustomer = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    res.status(200).json(toPublicUser(updatedCustomer, { includeAvatar: true }));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: duplicateFieldMessage(error) });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (cliente exclui a própria conta)
router.delete('/users/me', authenticateToken, requireUser, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.user.id } });
    res.status(200).json({ message: "Conta removida com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao remover conta." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe lista todos os clientes)
router.get('/users', authenticateToken, requireStaff, async (req, res) => {
  try {
    const customers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(customers.map(toPublicUser));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar clientes." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe busca um cliente específico)
router.get('/users/:id', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      // agendamentos do cliente: Admin vê todos; as demais só os que são delas
      include: { favoriteServices: true, exclusiveCoupons: true, appointments: { where: scopeWhere(req.actor) } },
    });

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    res.json(toPublicUser(customer));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

//------------------------------------------------------------- POST ROUTE (equipe cadastra um cliente diretamente)
router.post('/users', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { email, name, password, gender, phone, birthdate, cpf } = req.body;
    const cpfDigits = (cpf || "").replace(/\D/g, "");

    if (!email?.trim() || !name?.trim() || !password || !cpfDigits) {
      return res.status(400).json({ error: "Preencha nome, CPF, email e senha." });
    }

    if (!isValidCpf(cpfDigits)) {
      return res.status(400).json({ error: "CPF inválido." });
    }

    let parsedBirthdate;
    if (birthdate) {
      parsedBirthdate = new Date(birthdate);
      if (Number.isNaN(parsedBirthdate.getTime())) {
        return res.status(400).json({ error: "Data de nascimento inválida." });
      }
      if (isUnderMinAge(parsedBirthdate)) {
        return res.status(400).json({ error: MIN_AGE_MESSAGE });
      }
    }

    const passwordProblems = validatePassword(password, { name, email });
    if (passwordProblems.length) {
      return res.status(400).json({ error: passwordProblems[0], problems: passwordProblems });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const customer = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        cpf: cpfDigits,
        password: hashedPassword,
        gender,
        phone,
        birthdate: parsedBirthdate,
      },
    });

    res.status(201).json(toPublicUser(customer));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: duplicateFieldMessage(error) });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao criar cliente." });
  }
});

//------------------------------------------------------------- PUT ROUTE (Admin edita um cliente específico)
// Só o Admin edita clientes (stockAuth carrega o cargo do banco, não do token).
router.put('/users/:id', ...stockAuth, requirePermission('customers.manage'), async (req, res) => {
  try {
    const { name, email, password, gender, phone, birthdate, cpf } = req.body;

    const data = { name, email, gender, phone };

    if (cpf !== undefined) {
      const cpfDigits = cpf.replace(/\D/g, "");
      if (!isValidCpf(cpfDigits)) {
        return res.status(400).json({ error: "CPF inválido." });
      }
      data.cpf = cpfDigits;
    }

    if (birthdate) {
      const parsedBirthdate = new Date(birthdate);
      if (Number.isNaN(parsedBirthdate.getTime())) {
        return res.status(400).json({ error: "Data de nascimento inválida." });
      }
      if (isUnderMinAge(parsedBirthdate)) {
        return res.status(400).json({ error: MIN_AGE_MESSAGE });
      }
      data.birthdate = parsedBirthdate;
    }

    // só troca a senha se o admin realmente digitou uma nova; campo
    // vazio = mantém a senha atual
    if (password) {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { name: true, email: true } });
      const passwordProblems = validatePassword(password, { name: name ?? target?.name, email: email ?? target?.email });
      if (passwordProblems.length) {
        return res.status(400).json({ error: passwordProblems[0], problems: passwordProblems });
      }
      data.password = await bcrypt.hash(password, 10);
    }

    const updatedCustomer = await prisma.user.update({
      where: { id: req.params.id }, // ObjectId do Mongo é string, não Number
      data,
    });

    res.status(200).json(toPublicUser(updatedCustomer));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: duplicateFieldMessage(error) });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar cliente." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (Admin remove um cliente específico)
// Só o Admin exclui clientes (a exclusão também afeta o histórico das demais profissionais).
router.delete('/users/:id', ...stockAuth, requirePermission('customers.manage'), async (req, res) => {
  try {
    await prisma.user.delete({
      where: { id: req.params.id }, // ObjectId do Mongo é string, não Number
    });

    res.status(200).json({ message: "Cliente removido com sucesso." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover cliente." });
  }
});

export default router;
