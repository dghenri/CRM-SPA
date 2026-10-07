import { Router } from 'express';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ACCESS_TOKEN_KEY } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { toPublicUser } from '../lib/serializers.js';
import { duplicateFieldMessage, isValidCpf } from '../lib/validators.js';
import { authenticateToken, requireStaff, requireUser } from '../middleware/auth.js';

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

    const hashedPassword = await bcrypt.hash(password, 10);

    const customer = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        cpf: cpfDigits,
        password: hashedPassword,
      },
    });

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

    const customer = await prisma.user.findUnique({ where: { email } });

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

    res.json({ token, user: toPublicUser({ ...customer, lastLogin: loginAt }) });
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

    res.json(toPublicUser(customer));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

//------------------------------------------------------------- PUT ROUTE (cliente edita o próprio perfil / completa o cadastro depois)
router.put('/users/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const { name, email, password, gender, phone, birthdate, cpf } = req.body;

    const data = { name, email, gender, phone };

    // Progressive Profiling: é por aqui que o cliente completa o cadastro
    // depois (telefone, gênero, data de nascimento), e também onde pode
    // corrigir o CPF se necessário.
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
      data.birthdate = parsedBirthdate;
    }

    // só troca a senha se realmente veio uma nova; campo vazio = mantém a atual
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const updatedCustomer = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    res.status(200).json(toPublicUser(updatedCustomer));
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
router.get('/users/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { favoriteServices: true, exclusiveCoupons: true, appointments: true },
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

//------------------------------------------------------------- PUT ROUTE (equipe edita um cliente específico)
router.put('/users/:id', authenticateToken, requireStaff, async (req, res) => {
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
      data.birthdate = parsedBirthdate;
    }

    // só troca a senha se o admin realmente digitou uma nova; campo
    // vazio = mantém a senha atual
    if (password) {
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

//------------------------------------------------------------- DELETE ROUTE (equipe remove um cliente específico)
router.delete('/users/:id', authenticateToken, requireStaff, async (req, res) => {
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
