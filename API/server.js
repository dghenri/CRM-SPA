import express from 'express';
import cors from 'cors';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import 'dotenv/config';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const { ACCESS_TOKEN_KEY } = process.env;

// Desliga o ETag automático do Express. Sem isso, o navegador pode receber
// um 304 Not Modified (corpo vazio) em vez do JSON de fato, achando que a
// resposta "não mudou" - o que quebra chamadas de API que sempre devem vir
// com dados frescos (como GET /appointments).
app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Valores padrão pra `Staff.settings` quando o campo ainda não foi
// definido (ex: contas criadas antes dessa configuração existir).
// Qualquer preferência nova (ex: notificações, densidade da agenda) entra
// aqui, sem precisar de migration no schema.
const DEFAULT_STAFF_SETTINGS = {
  dragAppointments: false,
  theme: "system",
  showClockSeconds: true,
};

// Campos da equipe (Staff) que podem ir para o front (nunca inclua "password" aqui)
function toPublicStaff(staff) {
  if (!staff) return null;
  const { password, ...safeStaff } = staff;
  return { ...safeStaff, settings: { ...DEFAULT_STAFF_SETTINGS, ...(staff.settings || {}) } };
}

// Idem para User (cliente)
function toPublicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

// Validação de CPF (dígitos verificadores). Usada no cadastro (público e via
// equipe) e em qualquer edição que troque o CPF - recebe o valor já só com
// dígitos (sem pontuação).
function isValidCpf(cpf) {
  if (!cpf || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let check1 = 11 - (sum % 11);
  if (check1 >= 10) check1 = 0;
  if (check1 !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let check2 = 11 - (sum % 11);
  if (check2 >= 10) check2 = 0;
  if (check2 !== parseInt(cpf[10], 10)) return false;

  return true;
}

// Mensagem de erro padrão pra conflito de unicidade (e-mail ou CPF
// duplicado), usada em qualquer rota que crie/edite um User.
function duplicateFieldMessage(error) {
  const target = error.meta?.target;
  const isCpf = Array.isArray(target) ? target.includes("cpf") : String(target || "").includes("cpf");
  return isCpf ? "Este CPF já está cadastrado." : "Este e-mail já está cadastrado.";
}


// Origens sempre liberadas (dev local). Pra testar via túnel, defina no
// .env: FRONTEND_URL=https://sua-url-do-tunel.trycloudflare.com
const ALLOWED_ORIGINS = ["http://localhost:5173"];
if (process.env.FRONTEND_URL) ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);

app.use(cors({
  origin(origin, callback) {
    // requisições sem "origin" (ex: curl, Postman) não passam por CORS
    if (!origin) return callback(null, true);

    const isAllowed =
      ALLOWED_ORIGINS.includes(origin) ||
      // túneis rápidos do Cloudflare geram um subdomínio aleatório a cada
      // execução (ex: https://abc-def.trycloudflare.com) - liberamos o
      // domínio inteiro só pra facilitar testes, não use isso em produção
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin);

    callback(isAllowed ? null : new Error("Origem não permitida por CORS."), isAllowed);
  },
}))
app.use(express.json())

//------------------------------------------------------------- MIDDLEWARE (JWT AUTH)
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Não autorizado." });

  jwt.verify(token, ACCESS_TOKEN_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Sessão expirada." });

    req.user = decoded;
    next();
  });
}

// Usar SEMPRE depois de authenticateToken - garante que o token é de um
// membro da equipe (Staff) e não de um cliente (User)
function requireStaff(req, res, next) {
  if (req.user?.type !== "staff") {
    return res.status(403).json({ error: "Acesso restrito à equipe." });
  }
  next();
}

// Usar SEMPRE depois de authenticateToken - garante que o token é de um
// cliente (User) e não de um membro da equipe (Staff)
function requireUser(req, res, next) {
  if (req.user?.type !== "user") {
    return res.status(403).json({ error: "Acesso restrito a clientes." });
  }
  next();
}

//------------------------------------------------------------- WEBSOCKET (avisos em tempo real pra equipe)
// Substitui o polling: em vez de cada aba da equipe perguntar "mudou
// alguma coisa?" de tempos em tempos, o servidor avisa na hora que algo
// muda. O front escuta essa mensagem e recarrega os dados (não mandamos os
// dados em si pelo socket, só o aviso - mantém o front simples e a
// resposta HTTP como única fonte de verdade dos dados).
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcastAppointmentsChanged() {
  const payload = JSON.stringify({ type: "appointments-changed" });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Autenticação do socket: o handshake de WebSocket não manda header
// Authorization, então o front passa o token JWT como query string
// (?token=...). Só a equipe precisa desses avisos - clientes não têm essa
// tela aberta o tempo todo, então nem participam do canal.
wss.on("connection", (ws, req) => {
  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const token = searchParams.get("token");
    const decoded = token && jwt.verify(token, ACCESS_TOKEN_KEY);

    if (!decoded || decoded.type !== "staff") {
      ws.close(4001, "Não autorizado.");
      return;
    }
  } catch (err) {
    ws.close(4001, "Não autorizado.");
    return;
  }

  // conexão autenticada - fica só esperando os broadcasts, não precisa
  // responder nada
});

//------------------------------------------------------------- POST ROUTE (CREATE STAFF)
app.post('/staff', async (req, res) => {
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
app.post('/auth/staff/login', async (req, res) => {
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
app.get('/auth/staff/me', authenticateToken, async (req, res) => {
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

//------------------------------------------------------------- GET ROUTE (protected)
app.get('/staff', authenticateToken, async (req, res) => {
  try {
    const hasFilters = req.query && Object.keys(req.query).length > 0;

    const staff = hasFilters
      ? await prisma.staff.findMany({
          where: {
            name: req.query.name,
            email: req.query.email,
            age: req.query.age ? Number(req.query.age) : undefined
          }
        })
      : await prisma.staff.findMany();

    res.status(200).json(staff.map(toPublicStaff))
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching staff." });
  }
})

//------------------------------------------------------------- PUT ROUTE (protected)
app.put('/staff/:id', authenticateToken, async (req, res) => {
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

    return res.status(500).json({
      message: "Error updating user.",
    });
  }
});

//------------------------------------------------------------- DELETE ROUTE (protected)
app.delete('/staff/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.staff.delete({
      where: {
        id: req.params.id // ObjectId do Mongo é string, não Number
      },
    })

    res.status(200).json({
      message: "User delete successfully." })
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting user." });
  }
});


//------------------------------------------------------------- GET ROUTE (services - público, usado pelo admin e pelo site do cliente)
app.get('/services', async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: { createdAt: 'asc' },
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(200).json(services);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar serviços." });
  }
});

//------------------------------------------------------------- POST ROUTE (services - protegido)
app.post('/services', authenticateToken, async (req, res) => {
  try {
    const { title, description, duration, price, image, available, professionalId } = req.body;

    if (!title?.trim() || !description?.trim() || !duration || !price) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    const service = await prisma.service.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        duration: Number(duration),
        price: Number(price),
        image:
          image?.trim() ||
          `https://picsum.photos/seed/${encodeURIComponent(title)}/600/450`,
        available: available ?? true,
        professionalId: professionalId || null,
      },
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(201).json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar serviço." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (services - protegido; edição e toggle de "available")
app.patch('/services/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, duration, price, image, available, professionalId } = req.body;

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (duration !== undefined) data.duration = Number(duration);
    if (price !== undefined) data.price = Number(price);
    if (image !== undefined) data.image = image.trim();
    if (available !== undefined) data.available = available;
    if (professionalId !== undefined) data.professionalId = professionalId || null;

    const service = await prisma.service.update({
      where: { id }, // ObjectId do Mongo é string, não Number
      data,
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(200).json(service);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar serviço." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (services - protegido)
app.delete('/services/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.service.delete({
      where: { id: req.params.id }, // ObjectId do Mongo é string, não Number
    });

    res.status(200).json({ message: "Serviço removido com sucesso." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover serviço." });
  }
});


//=============================================================== USERS (CLIENTES)

//------------------------------------------------------------- POST ROUTE (cadastro de cliente - público)
// Progressive Profiling: a primeira etapa do cadastro só exige o essencial
// (nome, CPF, email e senha). Telefone, gênero e data de nascimento são
// completados depois, via PUT /users/me, já com a conta criada.
app.post('/auth/user/register', async (req, res) => {
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
app.post('/auth/user/login', async (req, res) => {
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
app.get('/users/me', authenticateToken, requireUser, async (req, res) => {
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
app.put('/users/me', authenticateToken, requireUser, async (req, res) => {
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
app.delete('/users/me', authenticateToken, requireUser, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.user.id } });
    res.status(200).json({ message: "Conta removida com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao remover conta." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe lista todos os clientes)
app.get('/users', authenticateToken, requireStaff, async (req, res) => {
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
app.get('/users/:id', authenticateToken, requireStaff, async (req, res) => {
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
app.post('/users', authenticateToken, requireStaff, async (req, res) => {
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
app.put('/users/:id', authenticateToken, requireStaff, async (req, res) => {
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
app.delete('/users/:id', authenticateToken, requireStaff, async (req, res) => {
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

//=============================================================== FAVORITOS

//------------------------------------------------------------- GET ROUTE (lista favoritos do cliente logado)
app.get('/users/me/favorites', authenticateToken, requireUser, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { favoriteServices: true },
    });

    res.json(customer?.favoriteServices ?? []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar favoritos." });
  }
});

//------------------------------------------------------------- POST ROUTE (favoritar um serviço)
app.post('/users/me/favorites/:serviceId', authenticateToken, requireUser, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.serviceId } });
    if (!service) {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }

    const customer = await prisma.user.update({
      where: { id: req.user.id },
      data: { favoriteServices: { connect: { id: req.params.serviceId } } },
      include: { favoriteServices: true },
    });

    res.status(200).json(customer.favoriteServices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao favoritar serviço." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (desfavoritar um serviço)
app.delete('/users/me/favorites/:serviceId', authenticateToken, requireUser, async (req, res) => {
  try {
    const customer = await prisma.user.update({
      where: { id: req.user.id },
      data: { favoriteServices: { disconnect: { id: req.params.serviceId } } },
      include: { favoriteServices: true },
    });

    res.status(200).json(customer.favoriteServices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao remover favorito." });
  }
});

//=============================================================== AGENDAMENTOS (APPOINTMENTS)

// Código de 6 letras mostrado ao cliente (diferente do `id`, que é o
// ObjectId interno do Mongo). Tenta criar o agendamento algumas vezes,
// sorteando um novo código a cada colisão, pra cobrir o caso raro de dois
// clientes caírem no mesmo código ao mesmo tempo.
const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_PATTERN = /^[A-Z]{6}$/;

function generateAppointmentCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  }
  return code;
}

async function createAppointmentWithUniqueCode(data, preferredCode, options, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    // usa o código sugerido pelo front só na primeira tentativa - se colidir,
    // as tentativas seguintes sempre sorteiam um novo
    const code = i === 0 && CODE_PATTERN.test(preferredCode) ? preferredCode : generateAppointmentCode();

    try {
      return await prisma.appointment.create({
        data: { ...data, code },
        ...options,
      });
    } catch (error) {
      const isCodeCollision = error.code === "P2002" && error.meta?.target?.includes("code");
      if (!isCodeCollision || i === attempts - 1) throw error;
      // colisão no `code` - tenta de novo com outro código sorteado
    }
  }
}

//------------------------------------------------------------- POST ROUTE (cria um agendamento)
// - Cliente logado: só pode criar agendamento pra si mesmo, vinculado a um serviço.
// - Equipe logada: pode criar pra qualquer cliente (ou sem cliente/serviço vinculado -
//   ex: evento avulso na agenda), com título e cor personalizados.
app.post('/appointments', authenticateToken, async (req, res) => {
  try {
    const { title, date, endDate, color, notes, serviceId, customerId, professionalId, code } = req.body;

    if (!date || !endDate) {
      return res.status(400).json({ error: "Informe a data de início e término." });
    }

    let service = null;
    if (serviceId) {
      service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        return res.status(400).json({ error: "Serviço não encontrado." });
      }
    }

    const data = {
      title: (title?.trim() || service?.title || "Sem título"),
      date: new Date(date),
      endDate: new Date(endDate),
      color: color || "blue",
      notes,
    };

    if (serviceId) data.service = { connect: { id: serviceId } };

    // se não veio um profissional explícito, herda o responsável cadastrado
    // no próprio serviço (ex: Botox -> Dra. Fulana já vinculada por padrão)
    const resolvedProfessionalId = professionalId || service?.professionalId || null;
    if (resolvedProfessionalId) data.professional = { connect: { id: resolvedProfessionalId } };

    if (req.user.type === "user") {
      if (!serviceId || !service.available) {
        return res.status(400).json({ error: "Selecione um serviço disponível." });
      }
      data.customer = { connect: { id: req.user.id } };
    } else {
      // equipe: cliente é opcional (evento avulso na agenda)
      if (customerId) data.customer = { connect: { id: customerId } };
    }

    const appointment = await createAppointmentWithUniqueCode(data, code, {
      include: { service: true, customer: true, professional: { select: { id: true, name: true } } },
    });

    broadcastAppointmentsChanged();
    res.status(201).json({ ...appointment, customer: toPublicUser(appointment.customer) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar agendamento." });
  }
});

//------------------------------------------------------------- PUT ROUTE (equipe edita um agendamento completo)
app.put('/appointments/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { title, date, endDate, color, notes, status, serviceId, customerId, professionalId } = req.body;

    const data = {};
    if (title !== undefined) data.title = title.trim() || "Sem título";
    if (date !== undefined) data.date = new Date(date);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (color !== undefined) data.color = color;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) data.status = status;

    // connect/disconnect explícito: valor vazio ("" ou null) desvincula
    if (serviceId !== undefined) {
      data.service = serviceId ? { connect: { id: serviceId } } : { disconnect: true };
    }
    if (customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    if (professionalId !== undefined) {
      data.professional = professionalId ? { connect: { id: professionalId } } : { disconnect: true };
    }

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data,
      include: { service: true, customer: true, professional: { select: { id: true, name: true } } },
    });

    broadcastAppointmentsChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer) });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

//------------------------------------------------------------- GET ROUTE (agendamentos do cliente logado)
app.get('/appointments/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { customerId: req.user.id },
      include: { service: true, professional: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });

    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar agendamentos." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe lista todos os agendamentos, com filtros opcionais)
app.get('/appointments', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { status, customerId, serviceId } = req.query;

    const appointments = await prisma.appointment.findMany({
      where: {
        status: status || undefined,
        customerId: customerId || undefined,
        serviceId: serviceId || undefined,
      },
      include: { service: true, customer: true, professional: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });

    res.json(
      appointments.map((a) => ({ ...a, customer: toPublicUser(a.customer) }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar agendamentos." });
  }
});

//------------------------------------------------------------- GET ROUTE (disponibilidade de um serviço num dia - staff ou cliente)
// Não usamos `requireStaff` aqui de propósito: o cliente logado precisa
// disso pra saber quais horários já estão ocupados ANTES de criar o
// agendamento. Por isso o retorno traz só { date, endDate } de cada
// agendamento que ocupa a janela - nunca nome, email ou id do cliente dono
// do horário, pra não vazar dado de um cliente pro outro.
app.get('/appointments/availability', authenticateToken, async (req, res) => {
  try {
    const { serviceId, from, to } = req.query;

    if (!serviceId || !from || !to) {
      return res.status(400).json({ error: "Informe serviceId, from e to." });
    }

    const rangeStart = new Date(from);
    const rangeEnd = new Date(to);

    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      return res.status(400).json({ error: "Datas inválidas." });
    }

    // qualquer status diferente de "Cancelled" ocupa o horário - um
    // agendamento recém-criado nasce como "Scheduled" (não "Confirmed"),
    // e ainda assim precisa bloquear o slot pra outros clientes
    const busyAppointments = await prisma.appointment.findMany({
      where: {
        serviceId,
        status: { not: "Cancelled" },
        // overlap: começa antes do fim da janela E termina depois do início dela
        date: { lt: rangeEnd },
        endDate: { gt: rangeStart },
      },
      select: { date: true, endDate: true },
    });

    res.json(busyAppointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao verificar disponibilidade." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (equipe atualiza só o status de um agendamento)
app.patch('/appointments/:id/status', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { status } = req.body;

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
      include: { service: true, customer: true, professional: { select: { id: true, name: true } } },
    });

    broadcastAppointmentsChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer) });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (cancelar agendamento - dono ou equipe)
app.delete('/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }

    const isOwner = req.user.type === "user" && req.user.id === appointment.customerId;
    const isStaff = req.user.type === "staff";

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "Você não pode cancelar este agendamento." });
    }

    await prisma.appointment.delete({ where: { id: req.params.id } });
    broadcastAppointmentsChanged();
    res.status(200).json({ message: "Agendamento cancelado com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao cancelar agendamento." });
  }
});

//=============================================================== CUPONS (COUPONS)

// Calcula o status "visual" do cupom (usado pelas abas do painel: Todos,
// Ativos, Agendados, Expirados, Arquivados) a partir dos campos reais do
// banco, em vez de guardar um status redundante que poderia ficar
// desatualizado.
function getCouponStatus(coupon, now = new Date()) {
  if (coupon.archivedAt) return "archived";
  if (coupon.expiresAt && coupon.expiresAt <= now) return "expired";
  if (coupon.startsAt && coupon.startsAt > now) return "scheduled";
  return "active";
}

function serializeCoupon(coupon) {
  return { ...coupon, status: getCouponStatus(coupon) };
}

// confere se o cupom vale pra essa compra específica (applicable_to). Usado
// tanto na pré-validação do bookingflow (/coupons/validate) quanto na hora
// de aplicar de fato (/coupons/apply), pra manter as duas em sincronia.
async function checkCouponScope(coupon, { userId, serviceId }) {
  if (coupon.scope === "SpecificServices" && (!serviceId || !coupon.serviceIds.includes(serviceId))) {
    return "Este cupom não é válido para o serviço selecionado.";
  }

  if (coupon.scope === "Category") {
    const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;
    if (!service || service.category !== coupon.category) {
      return "Este cupom não é válido para essa categoria de serviço.";
    }
  }

  if (coupon.scope === "FirstPurchase") {
    const priorAppointments = await prisma.appointment.count({
      where: { customerId: userId, status: "Completed" },
    });
    if (priorAppointments > 0) {
      return "Este cupom vale só na primeira compra.";
    }
  }

  return null;
}

function computeCouponDiscount(coupon, purchaseAmount) {
  const amount = Number(purchaseAmount) || 0;
  let discountAmount = coupon.discountType === "Percentage"
    ? (amount * coupon.discountValue) / 100
    : coupon.discountValue;
  if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  return discountAmount;
}

//------------------------------------------------------------- POST ROUTE (equipe cria um cupom)
app.post('/coupons', authenticateToken, requireStaff, async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue,
      minPurchase, maxDiscount, startsAt, expiresAt,
      usageLimit, perUserLimit, userId,
      scope, serviceIds, category,
    } = req.body;

    if (!code?.trim() || !discountType || discountValue === undefined) {
      return res.status(400).json({ error: "Preencha código, tipo e valor do desconto." });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.trim().toUpperCase(),
        description: description?.trim() || undefined,
        discountType,
        discountValue: Number(discountValue),
        minPurchase: minPurchase !== undefined && minPurchase !== "" ? Number(minPurchase) : undefined,
        maxDiscount: maxDiscount !== undefined && maxDiscount !== "" ? Number(maxDiscount) : undefined,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        usageLimit: usageLimit !== undefined && usageLimit !== "" ? Number(usageLimit) : undefined,
        perUserLimit: perUserLimit !== undefined && perUserLimit !== "" ? Number(perUserLimit) : undefined,
        // applicable_to: pra que o cupom vale (todos os serviços, específicos, categoria, 1ª compra ou 1 cliente)
        scope: scope || "AllServices",
        category: scope === "Category" ? category?.trim() : undefined,
        serviceIds: scope === "SpecificServices" && Array.isArray(serviceIds) ? serviceIds : [],
        userId: (scope === "SpecificCustomer" && userId) ? userId : undefined,
      },
    });

    res.status(201).json(serializeCoupon(coupon));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Já existe um cupom com esse código." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao criar cupom." });
  }
});

//------------------------------------------------------------- PUT ROUTE (equipe edita um cupom existente)
app.put('/coupons/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue,
      minPurchase, maxDiscount, startsAt, expiresAt,
      usageLimit, perUserLimit, userId,
      scope, serviceIds, category, archivedAt,
    } = req.body;

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        code: code ? code.trim().toUpperCase() : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        discountType,
        discountValue: discountValue !== undefined ? Number(discountValue) : undefined,
        minPurchase: minPurchase !== undefined ? (minPurchase === "" ? null : Number(minPurchase)) : undefined,
        maxDiscount: maxDiscount !== undefined ? (maxDiscount === "" ? null : Number(maxDiscount)) : undefined,
        startsAt: startsAt !== undefined ? (startsAt ? new Date(startsAt) : null) : undefined,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
        usageLimit: usageLimit !== undefined ? (usageLimit === "" ? null : Number(usageLimit)) : undefined,
        perUserLimit: perUserLimit !== undefined ? (perUserLimit === "" ? null : Number(perUserLimit)) : undefined,
        // arquivar/desarquivar junto com a edição (mesmo campo da rota PATCH /:id/archive)
        archivedAt: archivedAt !== undefined ? (archivedAt ? new Date(archivedAt) : null) : undefined,
        // applicable_to: reconecta do zero pra refletir o escopo escolhido na edição
        scope,
        category: scope !== undefined ? (scope === "Category" ? category?.trim() || null : null) : undefined,
        serviceIds: scope !== undefined
          ? (scope === "SpecificServices" && Array.isArray(serviceIds) ? serviceIds : [])
          : undefined,
        userId: scope !== undefined
          ? (scope === "SpecificCustomer" && userId ? userId : null)
          : (userId !== undefined ? (userId || null) : undefined),
      },
    });

    res.status(200).json(serializeCoupon(coupon));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Já existe um cupom com esse código." });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao editar cupom." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (arquivar / desarquivar um cupom)
app.patch('/coupons/:id/archive', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { archived } = req.body; // true = arquivar, false = desarquivar

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: { archivedAt: archived === false ? null : new Date() },
    });

    res.status(200).json(serializeCoupon(coupon));
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao arquivar cupom." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (equipe apaga um cupom definitivamente)
app.delete('/coupons/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: "Cupom removido com sucesso." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    // P2003/P2014: já existe resgate (CouponRedemption) referenciando esse
    // cupom - o Prisma bloqueia a exclusão pra não deixar histórico órfão.
    if (error.code === "P2003" || error.code === "P2014") {
      return res.status(409).json({
        error: "Esse cupom já foi resgatado por algum cliente, então não pode ser excluído (isso apagaria o histórico de uso dele). Arquive o cupom em vez de excluir.",
      });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover cupom." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe lista todos os cupons, com filtro opcional por status/cliente)
app.get('/coupons', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { userId, status } = req.query;

    const coupons = await prisma.coupon.findMany({
      where: { userId: userId || undefined },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    const withStatus = coupons.map((c) => ({
      ...serializeCoupon(c),
      user: toPublicUser(c.user),
    }));

    res.json(status ? withStatus.filter((c) => c.status === status) : withStatus);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cupons." });
  }
});

//------------------------------------------------------------- GET ROUTE (cupons visíveis pro cliente logado: gerais + exclusivos dele, com status calculado)
app.get('/coupons/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const now = new Date();

    // ids de todo cupom que esse cliente já resgatou (claim ou uso, tanto faz)
    const myRedemptions = await prisma.couponRedemption.findMany({
      where: { userId: req.user.id },
      select: { couponId: true },
    });
    const claimedIds = [...new Set(myRedemptions.map((r) => r.couponId))];

    // só entram aqui cupons pessoais (userId = eu) ou que eu já resgatei pra
    // carteira em algum momento — um cupom público não some do banco, mas só
    // aparece pro cliente depois que ele digita o código em "Resgatar"
    // busca em duas partes bem simples e junta em JS. O filtro de arquivado
    // é aplicado aqui em JS também: o Prisma/Mongo não está resolvendo
    // "archivedAt: null" corretamente no where (bug conhecido do conector
    // Mongo pra campos DateTime opcionais), então filtramos depois de buscar.
    const [personalCoupons, claimedCoupons] = await Promise.all([
      prisma.coupon.findMany({ where: { userId: req.user.id } }),
      prisma.coupon.findMany({ where: { id: { in: claimedIds } } }),
    ]);

    const couponsById = new Map();
    for (const c of [...personalCoupons, ...claimedCoupons]) {
      if (!c.archivedAt) couponsById.set(c.id, c);
    }
    const coupons = [...couponsById.values()].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // conta, pra cada cupom, quantas vezes ESSE cliente já USOU de fato
    // (usedAt preenchido) — resgate/claim sozinho não consome o limite.
    // Filtramos "usedAt não nulo" em JS pelo mesmo motivo do archivedAt acima.
    const myRedemptionsForCoupons = await prisma.couponRedemption.findMany({
      where: { userId: req.user.id, couponId: { in: coupons.map((c) => c.id) } },
    });
    const usageByCoupon = {};
    for (const r of myRedemptionsForCoupons) {
      if (r.usedAt) usageByCoupon[r.couponId] = (usageByCoupon[r.couponId] ?? 0) + 1;
    }

    const withStatus = coupons.map((c) => ({
      ...c,
      status: getCouponStatus(c, now),
      myUsageCount: usageByCoupon[c.id] ?? 0,
    }));

    res.json(withStatus);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cupons." });
  }
});

//------------------------------------------------------------- GET ROUTE (histórico de cupons já usados pelo cliente logado)
app.get('/coupons/me/redemptions', authenticateToken, requireUser, async (req, res) => {
  try {
    const allRedemptions = await prisma.couponRedemption.findMany({
      where: { userId: req.user.id },
      include: { coupon: true },
    });

    const redemptions = allRedemptions
      .filter((r) => r.usedAt)
      .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));

    res.json(redemptions.map((r) => ({ ...r, coupon: serializeCoupon(r.coupon) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cupons usados." });
  }
});

//------------------------------------------------------------- POST ROUTE (cliente resgata um cupom pelo código - só adiciona à carteira, não consome uso)
app.post('/coupons/redeem', authenticateToken, requireUser, async (req, res) => {
  try {
    const { code } = req.body;

    const coupon = await prisma.coupon.findUnique({ where: { code: code?.trim().toUpperCase() } });

    if (!coupon || (coupon.userId && coupon.userId !== req.user.id)) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }

    if (getCouponStatus(coupon) !== "active") {
      return res.status(400).json({ error: "Este cupom não está disponível para uso." });
    }

    if (coupon.perUserLimit) {
      const timesClaimedByUser = await prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId: req.user.id },
      });
      if (timesClaimedByUser >= coupon.perUserLimit) {
        return res.status(400).json({ error: "Você já atingiu o limite de uso deste cupom." });
      }
    }

    // "resgatar" só guarda o cupom na carteira do cliente (usedAt fica vazio).
    // Ele só entra pro limite global de usos e vira "usado" quando é de fato
    // aplicado num agendamento, através de /coupons/apply.
    const redemption = await prisma.couponRedemption.create({
      data: {
        coupon: { connect: { id: coupon.id } },
        user: { connect: { id: req.user.id } },
      },
      include: { coupon: true },
    });

    res.status(200).json(redemption);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao resgatar cupom." });
  }
});

//------------------------------------------------------------- POST ROUTE (pré-valida um cupom já resgatado contra o serviço escolhido no bookingflow, sem consumir)
app.post('/coupons/validate', authenticateToken, requireUser, async (req, res) => {
  try {
    const { code, serviceId, purchaseAmount } = req.body;

    const coupon = await prisma.coupon.findUnique({ where: { code: code?.trim().toUpperCase() } });
    if (!coupon || (coupon.userId && coupon.userId !== req.user.id)) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }

    // precisa ter sido resgatado antes (carteira) e ainda não ter sido aplicado
    const myRedemptionsForCoupon = await prisma.couponRedemption.findMany({
      where: { couponId: coupon.id, userId: req.user.id },
    });
    const redemption = myRedemptionsForCoupon
      .filter((r) => !r.usedAt)
      .sort((a, b) => new Date(a.claimedAt) - new Date(b.claimedAt))[0];
    if (!redemption) {
      return res.status(400).json({ error: "Resgate este cupom na aba Cupons antes de usá-lo." });
    }

    if (getCouponStatus(coupon) !== "active") {
      return res.status(400).json({ error: "Este cupom não está mais disponível." });
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ error: "Este cupom atingiu o limite de usos." });
    }

    const scopeError = await checkCouponScope(coupon, { userId: req.user.id, serviceId });
    if (scopeError) return res.status(400).json({ error: scopeError });

    if (coupon.minPurchase && (!purchaseAmount || purchaseAmount < coupon.minPurchase)) {
      return res.status(400).json({ error: `Valor mínimo de R$ ${coupon.minPurchase.toFixed(2)} para usar este cupom.` });
    }

    res.json({
      redemptionId: redemption.id,
      coupon,
      discountAmount: computeCouponDiscount(coupon, purchaseAmount),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao validar cupom." });
  }
});

//------------------------------------------------------------- POST ROUTE (aplica de fato um cupom já resgatado a um agendamento - só aqui conta como usado)
app.post('/coupons/apply', authenticateToken, requireUser, async (req, res) => {
  try {
    const { redemptionId, serviceId, purchaseAmount, appointmentId } = req.body;

    const redemption = await prisma.couponRedemption.findUnique({
      where: { id: redemptionId },
      include: { coupon: true },
    });

    if (!redemption || redemption.userId !== req.user.id) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    if (redemption.usedAt) {
      return res.status(400).json({ error: "Este cupom já foi utilizado." });
    }

    const { coupon } = redemption;

    if (getCouponStatus(coupon) !== "active") {
      return res.status(400).json({ error: "Este cupom não está mais disponível." });
    }
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ error: "Este cupom atingiu o limite de usos." });
    }

    const scopeError = await checkCouponScope(coupon, { userId: req.user.id, serviceId });
    if (scopeError) return res.status(400).json({ error: scopeError });

    if (coupon.minPurchase && (!purchaseAmount || purchaseAmount < coupon.minPurchase)) {
      return res.status(400).json({ error: `Valor mínimo de R$ ${coupon.minPurchase.toFixed(2)} para usar este cupom.` });
    }

    const discountAmount = computeCouponDiscount(coupon, purchaseAmount);

    const [, updatedRedemption] = await prisma.$transaction([
      prisma.coupon.update({
        where: { id: coupon.id },
        data: { usageCount: { increment: 1 } },
      }),
      prisma.couponRedemption.update({
        where: { id: redemption.id },
        data: {
          usedAt: new Date(),
          discountAmount,
          appointment: appointmentId ? { connect: { id: appointmentId } } : undefined,
        },
        include: { coupon: true },
      }),
    ]);

    res.status(200).json(updatedRedemption);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao aplicar cupom." });
  }
});


server.listen(3000, () => console.log("Server running on port 3000 (HTTP + WebSocket)"));

/*
1 - Tipo de rota / Método HTTP
2 - Endereço

*/
