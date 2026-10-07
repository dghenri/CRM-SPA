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

function broadcastToStaff(type) {
  const payload = JSON.stringify({ type });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastAppointmentsChanged() {
  broadcastToStaff("appointments-changed");
}

// estoque: produtos, lotes ou solicitações mudaram (o front recarrega a tela)
function broadcastStockChanged() {
  broadcastToStaff("stock-changed");
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
    // a receita (RecipeItem) depende do serviço: sai junto com ele
    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { serviceId: req.params.id } });
      await tx.service.delete({ where: { id: req.params.id } }); // ObjectId do Mongo é string, não Number
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

const APPOINTMENT_STATUSES = ["Scheduled", "Confirmed", "Completed", "Cancelled", "NoShow"];
const APPOINTMENT_INCLUDE = { service: true, customer: true, professional: { select: { id: true, name: true } } };

//------------------------------------------------------------- PUT ROUTE (equipe edita um agendamento completo)
app.put('/appointments/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { title, date, endDate, color, notes, status, serviceId, customerId, professionalId } = req.body;

    if (status !== undefined && !APPOINTMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }

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

    const { appointment, stock } = await prisma.$transaction(async (tx) => {
      const before = await tx.appointment.findUnique({ where: { id: req.params.id } });
      if (!before) {
        const notFound = new Error("Agendamento não encontrado.");
        notFound.code = "P2025";
        throw notFound;
      }
      const appointment = await tx.appointment.update({ where: { id: req.params.id }, data, include: APPOINTMENT_INCLUDE });
      const stock = await syncAppointmentStock(tx, { before, after: appointment, staffId: req.user.id });
      return { appointment, stock };
    });

    broadcastAppointmentsChanged();
    if (stock.changed) broadcastStockChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer), stockWarnings: stock.warnings });
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
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
    if (!APPOINTMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }

    const { appointment, stock } = await prisma.$transaction(async (tx) => {
      const before = await tx.appointment.findUnique({ where: { id: req.params.id } });
      if (!before) {
        const notFound = new Error("Agendamento não encontrado.");
        notFound.code = "P2025";
        throw notFound;
      }
      const appointment = await tx.appointment.update({ where: { id: req.params.id }, data: { status }, include: APPOINTMENT_INCLUDE });
      const stock = await syncAppointmentStock(tx, { before, after: appointment, staffId: req.user.id });
      return { appointment, stock };
    });

    broadcastAppointmentsChanged();
    if (stock.changed) broadcastStockChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer), stockWarnings: stock.warnings });
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
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

    // atendimento concluído já consumiu insumos: só a equipe pode removê-lo (o estorno é registrado em nome dela)
    if (appointment.status === "Completed" && !isStaff) {
      return res.status(403).json({ error: "Atendimentos concluídos não podem ser removidos." });
    }

    const reverted = await prisma.$transaction(async (tx) => {
      // devolve ao estoque o que o atendimento consumiu, ANTES de apagá-lo
      const reverted = isStaff
        ? await revertAppointmentConsumption(tx, {
            appointmentId: appointment.id,
            staffId: req.user.id,
            reason: "Estorno: atendimento excluído",
          })
        : false;
      await tx.appointment.delete({ where: { id: req.params.id } });
      return reverted;
    });

    broadcastAppointmentsChanged();
    if (reverted) broadcastStockChanged();
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


//=============================================================== ESTOQUE (INSUMOS)
//
// Modelo: ledger (StockMovement) + lotes (StockBatch) + cache de saldo
// (Product.currentStock). Nada altera saldo sem passar por applyStockItems(),
// sempre dentro de uma $transaction.
//
// - MajorAdmin aplica direto (a solicitação é gravada já como Approved, só
//   pra manter a auditoria uniforme).
// - Demais cargos criam uma StockRequest (Pending) e o MajorAdmin aprova/nega.
// - Entrada (Purchase), Loss e Adjustment passam por aprovação. Consumo por
//   receita (fase 2) é automático e não passa por aqui.

const MAJOR_ADMIN = "MajorAdmin";
const REQUESTABLE_TYPES = ["Purchase", "Loss", "Adjustment"];
const EXPIRING_SOON_DAYS = 30;

// evita lixo de ponto flutuante (0.1 + 0.2) no saldo
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

class StockError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// carrega o Staff do banco (não confia em role vinda do JWT, mesmo padrão do PUT /staff)
async function loadStaff(req, res, next) {
  try {
    const staff = await prisma.staff.findUnique({ where: { id: req.user.id } });
    if (!staff) return res.status(401).json({ error: "Sessão expirada." });
    if (staff.status === "Inactive") return res.status(403).json({ error: "Conta inativa." });
    req.staff = staff;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao validar usuário." });
  }
}

// usar depois de authenticateToken, requireStaff, loadStaff
function requireMajorAdmin(req, res, next) {
  if (req.staff?.role !== MAJOR_ADMIN) {
    return res.status(403).json({ error: "Apenas o MajorAdmin pode fazer isso." });
  }
  next();
}

const stockAuth = [authenticateToken, requireStaff, loadStaff];

function canHandleProduct(staff, product) {
  return staff.role === MAJOR_ADMIN || (product.allowedRoles || []).includes(staff.role);
}

// ordem FEFO: vence primeiro, sai primeiro. Lotes sem validade vão por último.
// Feito em JS (expiresAt é opcional e filtros de null no conector Mongo do Prisma são instáveis).
function sortFefo(batches) {
  return [...batches].sort((a, b) => {
    const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
    const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
    if (ae !== be) return ae - be;
    return new Date(a.receivedAt) - new Date(b.receivedAt);
  });
}

// quando o frasco aberto deixa de valer
function openedExpiresAt(batch, product) {
  if (!batch.openedAt || !product.shelfLifeAfterOpenHours) return null;
  return new Date(new Date(batch.openedAt).getTime() + product.shelfLifeAfterOpenHours * 3600 * 1000);
}

function decorateBatch(batch, product, now = new Date()) {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400 * 1000);
  const openedExp = openedExpiresAt(batch, product);
  return {
    ...batch,
    openedExpiresAt: openedExp,
    isExpired: !!(batch.expiresAt && new Date(batch.expiresAt) <= now),
    isExpiringSoon: !!(batch.expiresAt && new Date(batch.expiresAt) > now && new Date(batch.expiresAt) <= soon),
    isOpenedExpired: !!(openedExp && openedExp <= now),
  };
}

// valor opcional vindo do front: "" / undefined / null => undefined
const optNumber = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

//------------------------------------------------------------- núcleo: aplica itens no estoque (SEMPRE dentro de uma transação)
// `tx` é o client da transação. Lança StockError (e a transação inteira é desfeita).
async function decrementBatch(tx, batch, qty, product) {
  // updateMany condicional = proteção contra concorrência: só abate se ainda tem saldo
  const r = await tx.stockBatch.updateMany({
    where: { id: batch.id, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  if (r.count !== 1) {
    throw new StockError(`Saldo insuficiente no lote${batch.lotNumber ? ` ${batch.lotNumber}` : ""} de ${product.name}.`, 409);
  }
}

async function applyStockItems(tx, { type, items, staffId, requestId, reason }) {
  for (const item of items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new StockError("Produto não encontrado.", 404);
    if (!product.active) throw new StockError(`O produto ${product.name} está inativo.`);

    const movementBase = { type, productId: product.id, staffId, requestId: requestId || undefined, reason: reason || undefined };
    let delta = 0;

    if (type === "Purchase") {
      // trackOpening: 1 lote por embalagem (cada frasco abre em momentos diferentes)
      const splitByPackage = product.trackOpening && item.packages && Number.isInteger(item.packages);
      const parts = splitByPackage
        ? Array.from({ length: item.packages }, () => round3(item.quantity / item.packages))
        : [round3(item.quantity)];

      for (const qty of parts) {
        const batch = await tx.stockBatch.create({
          data: {
            productId: product.id,
            quantity: qty,
            lotNumber: item.lotNumber || undefined,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            unitCost: item.unitCost ?? undefined,
          },
        });
        await tx.stockMovement.create({
          data: { ...movementBase, batchId: batch.id, quantity: qty, unitCost: item.unitCost ?? undefined },
        });
        delta += qty;
      }
      if (item.unitCost != null) {
        await tx.product.update({ where: { id: product.id }, data: { lastCost: item.unitCost } });
      }
    } else if (type === "Loss") {
      let remaining = round3(item.quantity);
      let candidates;
      if (item.batchId) {
        const b = await tx.stockBatch.findUnique({ where: { id: item.batchId } });
        if (!b || b.productId !== product.id) throw new StockError("Lote inválido para este produto.");
        candidates = [b];
      } else {
        candidates = sortFefo(await tx.stockBatch.findMany({ where: { productId: product.id, quantity: { gt: 0 } } }));
      }
      for (const b of candidates) {
        if (remaining <= 0) break;
        const take = round3(Math.min(b.quantity, remaining));
        if (take <= 0) continue;
        await decrementBatch(tx, b, take, product);
        await tx.stockMovement.create({ data: { ...movementBase, batchId: b.id, quantity: -take } });
        remaining = round3(remaining - take);
        delta -= take;
      }
      if (remaining > 0) throw new StockError(`Saldo insuficiente de ${product.name}.`, 409);
    } else if (type === "Adjustment") {
      const b = item.batchId ? await tx.stockBatch.findUnique({ where: { id: item.batchId } }) : null;
      if (!b || b.productId !== product.id) throw new StockError("Informe um lote válido para o ajuste.");
      const qty = round3(item.quantity);
      if (qty < 0) {
        await decrementBatch(tx, b, -qty, product);
      } else {
        await tx.stockBatch.update({ where: { id: b.id }, data: { quantity: { increment: qty } } });
      }
      await tx.stockMovement.create({ data: { ...movementBase, batchId: b.id, quantity: qty } });
      delta += qty;
    } else {
      throw new StockError("Tipo de movimentação inválido.");
    }

    // cache do saldo (confere com a soma do ledger)
    await tx.product.update({ where: { id: product.id }, data: { currentStock: { increment: round3(delta) } } });
  }
}

//------------------------------------------------------------- valida e normaliza os itens recebidos do front
async function normalizeRequestItems(type, rawItems, staff) {
  if (!REQUESTABLE_TYPES.includes(type)) throw new StockError("Tipo inválido. Use Purchase, Loss ou Adjustment.");
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new StockError("Adicione ao menos um item.");
  if (rawItems.length > 50) throw new StockError("Itens demais em uma única solicitação.");

  const products = await prisma.product.findMany({ where: { id: { in: rawItems.map((i) => String(i.productId)) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = [];

  for (const raw of rawItems) {
    const product = byId.get(String(raw.productId));
    if (!product) throw new StockError("Produto não encontrado.", 404);
    if (!product.active) throw new StockError(`O produto ${product.name} está inativo.`);
    if (!canHandleProduct(staff, product)) {
      throw new StockError(`Você não tem permissão para movimentar ${product.name}.`, 403);
    }

    const item = { productId: product.id };

    if (type === "Purchase") {
      const packages = Number(raw.packages);
      if (!Number.isFinite(packages) || packages <= 0) throw new StockError(`Informe a quantidade de ${product.purchaseUnitLabel || "embalagens"} de ${product.name}.`);
      item.packages = packages;
      item.quantity = round3(packages * product.purchaseUnitSize);
      if (raw.lotNumber?.trim()) item.lotNumber = raw.lotNumber.trim();
      if (raw.expiresAt) {
        const d = new Date(raw.expiresAt);
        if (Number.isNaN(d.getTime())) throw new StockError("Validade inválida.");
        item.expiresAt = d;
      }
      // o front manda o custo POR EMBALAGEM; guardamos por unidade base
      const packageCost = optNumber(raw.packageCost);
      if (packageCost !== undefined) {
        if (!(packageCost >= 0)) throw new StockError("Custo inválido.");
        item.unitCost = round3(packageCost / product.purchaseUnitSize);
      }
    } else {
      const qty = Number(raw.quantity);
      if (!Number.isFinite(qty) || qty === 0) throw new StockError(`Informe a quantidade de ${product.name}.`);
      if (type === "Loss" && qty < 0) throw new StockError("Em perdas, informe a quantidade como valor positivo.");
      item.quantity = round3(qty);
      if (raw.batchId) item.batchId = String(raw.batchId);
      if (type === "Adjustment" && !item.batchId) throw new StockError(`Escolha o lote de ${product.name} para o ajuste.`);
    }

    out.push(item);
  }
  return out;
}

//------------------------------------------------------------- serialização: anexa nome/unidade do produto aos itens da solicitação
async function serializeRequests(requests) {
  const ids = [...new Set(requests.flatMap((r) => r.items.map((i) => i.productId)))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  return requests.map((r) => ({
    ...r,
    items: r.items.map((i) => {
      const p = byId.get(i.productId);
      return {
        ...i,
        productName: p?.name ?? "(produto removido)",
        unit: p?.unit,
        purchaseUnitLabel: p?.purchaseUnitLabel,
      };
    }),
  }));
}

const requestInclude = {
  requestedBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true } },
};

//=============================================================== PRODUTOS

function parseProductBody(body, { partial = false } = {}) {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("name")) {
    if (!body.name?.trim()) throw new StockError("Informe o nome do produto.");
    data.name = body.name.trim();
  }
  if (!partial || has("unit")) {
    if (!["Un", "Ml", "G"].includes(body.unit)) throw new StockError("Unidade inválida (Un, Ml ou G).");
    data.unit = body.unit;
  }
  if (has("sku")) data.sku = body.sku?.trim() || null;
  if (has("category")) data.category = body.category?.trim() || null;
  if (has("active")) data.active = !!body.active;
  if (has("purchaseUnitLabel")) data.purchaseUnitLabel = body.purchaseUnitLabel?.trim() || null;
  if (has("purchaseUnitSize")) {
    const size = Number(body.purchaseUnitSize);
    if (!(size > 0)) throw new StockError("O tamanho da embalagem deve ser maior que zero.");
    data.purchaseUnitSize = size;
  }
  if (has("minStock")) {
    const min = Number(body.minStock) || 0;
    if (min < 0) throw new StockError("Estoque mínimo inválido.");
    data.minStock = min;
  }
  if (has("trackOpening")) data.trackOpening = !!body.trackOpening;
  if (has("shelfLifeAfterOpenHours")) {
    const h = optNumber(body.shelfLifeAfterOpenHours);
    data.shelfLifeAfterOpenHours = h && h > 0 ? Math.round(h) : null;
  }
  if (has("allowedRoles")) {
    const valid = ["MajorAdmin", "Farmaceutica", "Massoterapeuta"];
    if (!Array.isArray(body.allowedRoles) || body.allowedRoles.some((r) => !valid.includes(r))) {
      throw new StockError("Cargos permitidos inválidos.");
    }
    // MajorAdmin sempre pode; não precisa ficar na lista
    data.allowedRoles = [...new Set(body.allowedRoles.filter((r) => r !== MAJOR_ADMIN))];
  }
  return data;
}

//------------------------------------------------------------- GET ROUTE (lista produtos com saldo, lotes e alertas - toda a equipe vê)
app.get('/products', ...stockAuth, async (req, res) => {
  try {
    const includeInactive = req.staff.role === MAJOR_ADMIN && req.query.includeInactive === "true";
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    const visible = includeInactive ? products : products.filter((p) => p.active);

    const batches = await prisma.stockBatch.findMany({
      where: { productId: { in: visible.map((p) => p.id) }, quantity: { gt: 0 } },
    });
    const batchesByProduct = new Map();
    for (const b of batches) {
      if (!batchesByProduct.has(b.productId)) batchesByProduct.set(b.productId, []);
      batchesByProduct.get(b.productId).push(b);
    }

    const now = new Date();
    res.json(visible.map((p) => {
      const productBatches = sortFefo(batchesByProduct.get(p.id) || []).map((b) => decorateBatch(b, p, now));
      return {
        ...p,
        canRequest: canHandleProduct(req.staff, p),
        batches: productBatches,
        alerts: {
          lowStock: p.minStock > 0 && p.currentStock <= p.minStock,
          expired: productBatches.some((b) => b.isExpired),
          expiringSoon: productBatches.some((b) => b.isExpiringSoon),
          openedExpired: productBatches.some((b) => b.isOpenedExpired),
        },
      };
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar produtos." });
  }
});

//------------------------------------------------------------- POST ROUTE (MajorAdmin cadastra produto - saldo nasce zerado, entra só via movimentação)
app.post('/products', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const data = parseProductBody(req.body);
    const product = await prisma.product.create({ data });
    broadcastStockChanged();
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe um produto com esse SKU." });
    console.error(error);
    res.status(500).json({ error: "Erro ao criar produto." });
  }
});

//------------------------------------------------------------- PUT ROUTE (MajorAdmin edita produto; currentStock NÃO é editável aqui)
app.put('/products/:id', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const data = parseProductBody(req.body, { partial: true });
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    broadcastStockChanged();
    res.json(product);
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe um produto com esse SKU." });
    if (error.code === "P2025") return res.status(404).json({ error: "Produto não encontrado." });
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar produto." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (registra a abertura de um frasco/lote)
// Não mexe em saldo, então não precisa de aprovação: basta ter permissão no produto.
app.patch('/stock/batches/:id/open', ...stockAuth, async (req, res) => {
  try {
    const batch = await prisma.stockBatch.findUnique({ where: { id: req.params.id }, include: { product: true } });
    if (!batch) return res.status(404).json({ error: "Lote não encontrado." });
    if (!canHandleProduct(req.staff, batch.product)) {
      return res.status(403).json({ error: "Você não tem permissão para este produto." });
    }
    if (!batch.product.trackOpening) {
      return res.status(400).json({ error: "Este produto não controla abertura de frasco." });
    }
    if (batch.openedAt) return res.status(409).json({ error: "Este frasco já foi marcado como aberto." });
    if (batch.quantity <= 0) return res.status(400).json({ error: "Este lote está vazio." });

    let openedAt = new Date();
    if (req.body?.openedAt) {
      openedAt = new Date(req.body.openedAt);
      if (Number.isNaN(openedAt.getTime()) || openedAt > new Date()) {
        return res.status(400).json({ error: "Data de abertura inválida." });
      }
    }

    await prisma.stockBatch.update({ where: { id: batch.id }, data: { openedAt } });

    broadcastStockChanged();
    const updated = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
    res.json(decorateBatch(updated, batch.product));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao registrar abertura." });
  }
});

//=============================================================== SOLICITAÇÕES DE ESTOQUE

//------------------------------------------------------------- POST ROUTE (cria solicitação; MajorAdmin aplica direto)
app.post('/stock/requests', ...stockAuth, async (req, res) => {
  try {
    const { type, items, reason } = req.body;
    const normalized = await normalizeRequestItems(type, items, req.staff);
    const isAdmin = req.staff.role === MAJOR_ADMIN;

    if (type !== "Purchase" && !reason?.trim()) {
      return res.status(400).json({ error: "Informe o motivo (perda/ajuste exigem justificativa)." });
    }

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.stockRequest.create({
        data: {
          type,
          items: normalized,
          reason: reason?.trim() || undefined,
          requestedById: req.staff.id,
          ...(isAdmin ? { status: "Approved", reviewedById: req.staff.id, reviewedAt: new Date() } : {}),
        },
      });
      if (isAdmin) {
        await applyStockItems(tx, {
          type, items: normalized, staffId: req.staff.id, requestId: created.id, reason: reason?.trim(),
        });
      }
      return created;
    });

    broadcastStockChanged();
    const full = await prisma.stockRequest.findUnique({ where: { id: request.id }, include: requestInclude });
    const [serialized] = await serializeRequests([full]);
    res.status(201).json(serialized);
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Erro ao criar solicitação." });
  }
});

//------------------------------------------------------------- GET ROUTE (MajorAdmin vê todas; demais veem só as próprias)
app.get('/stock/requests', ...stockAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const isAdmin = req.staff.role === MAJOR_ADMIN;

    const requests = await prisma.stockRequest.findMany({
      where: {
        status: status || undefined,
        requestedById: isAdmin ? undefined : req.staff.id,
      },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json(await serializeRequests(requests));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar solicitações." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (MajorAdmin aprova: aplica no estoque, tudo-ou-nada)
app.patch('/stock/requests/:id/approve', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      // transição atômica Pending -> Approved: dois cliques não aplicam duas vezes
      const claim = await tx.stockRequest.updateMany({
        where: { id: req.params.id, status: "Pending" },
        data: { status: "Approved", reviewedById: req.staff.id, reviewedAt: new Date() },
      });
      if (claim.count !== 1) {
        const exists = await tx.stockRequest.findUnique({ where: { id: req.params.id } });
        throw new StockError(exists ? "Esta solicitação já foi analisada." : "Solicitação não encontrada.", exists ? 409 : 404);
      }

      const request = await tx.stockRequest.findUnique({ where: { id: req.params.id } });
      // saldo é validado AQUI (na aprovação), não na criação. Se faltar saldo,
      // o erro desfaz a transação inteira e a solicitação continua Pending.
      await applyStockItems(tx, {
        type: request.type, items: request.items, staffId: req.staff.id,
        requestId: request.id, reason: request.reason,
      });
    });

    broadcastStockChanged();
    const full = await prisma.stockRequest.findUnique({ where: { id: req.params.id }, include: requestInclude });
    const [serialized] = await serializeRequests([full]);
    res.json(serialized);
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Erro ao aprovar solicitação." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (MajorAdmin nega)
app.patch('/stock/requests/:id/reject', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const r = await prisma.stockRequest.updateMany({
      where: { id: req.params.id, status: "Pending" },
      data: {
        status: "Rejected",
        reviewedById: req.staff.id,
        reviewedAt: new Date(),
        reviewNote: req.body?.reviewNote?.trim() || undefined,
      },
    });
    if (r.count !== 1) {
      const exists = await prisma.stockRequest.findUnique({ where: { id: req.params.id } });
      return res.status(exists ? 409 : 404).json({ error: exists ? "Esta solicitação já foi analisada." : "Solicitação não encontrada." });
    }

    broadcastStockChanged();
    const full = await prisma.stockRequest.findUnique({ where: { id: req.params.id }, include: requestInclude });
    const [serialized] = await serializeRequests([full]);
    res.json(serialized);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao negar solicitação." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (quem solicitou cancela enquanto ainda está Pending)
app.patch('/stock/requests/:id/cancel', ...stockAuth, async (req, res) => {
  try {
    const r = await prisma.stockRequest.updateMany({
      where: { id: req.params.id, status: "Pending", requestedById: req.staff.id },
      data: { status: "Cancelled" },
    });
    if (r.count !== 1) {
      return res.status(409).json({ error: "Só é possível cancelar suas próprias solicitações pendentes." });
    }
    broadcastStockChanged();
    res.json({ message: "Solicitação cancelada." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao cancelar solicitação." });
  }
});

//------------------------------------------------------------- GET ROUTE (MajorAdmin: histórico/auditoria do ledger)
app.get('/stock/movements', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const { productId, type } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const movements = await prisma.stockMovement.findMany({
      where: { productId: productId || undefined, type: type || undefined },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        batch: { select: { id: true, lotNumber: true } },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar movimentações." });
  }
});

//=============================================================== ADMIN: OVERVIEW (DASHBOARD)
// Cole este bloco no server.js, ANTES do `server.listen(...)`.
// Depende de `stockAuth` e `requireMajorAdmin` (definidos no bloco de ESTOQUE).
//
// Regras de cálculo (todas sobre agendamentos com status "Completed"):
// - Faturamento = preço do serviço - desconto de cupom usado no agendamento.
//   (o Service não guarda o preço "congelado" no agendamento; se o preço do
//   serviço mudar, meses passados refletem o preço atual.)
// - Sessões = quantidade de agendamentos concluídos no mês.
// - Cancelamento = (Cancelled + NoShow) / (Completed + Cancelled + NoShow);
//   agendamentos ainda Scheduled/Confirmed não entram (o desfecho é desconhecido).
// - Recorrentes = % dos clientes atendidos no mês que já tinham sessão
//   concluída ANTES do mês.
// - Mês fechado no fuso America/Bahia (UTC-3, sem horário de verão).

const OVERVIEW_TZ_OFFSET_H = -3;
const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// início do mês (00:00 no fuso da clínica) como Date UTC. month0 pode estourar (-1 = dez do ano anterior)
const monthStartUtc = (year, month0) => new Date(Date.UTC(year, month0, 1, -OVERVIEW_TZ_OFFSET_H));

// { y, m0 } do mês em que `date` cai, no fuso da clínica
function clinicYearMonth(date) {
  const d = new Date(new Date(date).getTime() + OVERVIEW_TZ_OFFSET_H * 3600 * 1000);
  return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// variação percentual; sem base de comparação (mês anterior = 0) devolve null
const pctChange = (cur, prev) => (prev > 0 ? round1(((cur - prev) / prev) * 100) : null);

app.get('/admin/overview', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 2), 24);
    const now = new Date();
    const { y: curY, m0: curM0 } = clinicYearMonth(now);

    // buckets do mais antigo para o atual
    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = monthStartUtc(curY, curM0 - i);
      const { y, m0 } = clinicYearMonth(start);
      buckets.push({
        key: `${y}-${String(m0 + 1).padStart(2, "0")}`,
        label: MONTH_LABELS[m0],
        year: y,
        start,
        end: monthStartUtc(y, m0 + 1),
        revenue: 0,
        sessions: 0,
        cancelled: 0,
        customers: new Set(),
        newCustomers: 0,
      });
    }
    const bucketOf = (date) => {
      const { y, m0 } = clinicYearMonth(date);
      const key = `${y}-${String(m0 + 1).padStart(2, "0")}`;
      return buckets.find((b) => b.key === key);
    };

    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;

    const [appointments, newUsers] = await Promise.all([
      prisma.appointment.findMany({
        where: { date: { gte: rangeStart, lt: rangeEnd } },
        select: {
          date: true,
          status: true,
          customerId: true,
          service: { select: { price: true } },
          couponRedemptions: { select: { usedAt: true, discountAmount: true } },
        },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { createdAt: true },
      }),
    ]);

    for (const a of appointments) {
      const b = bucketOf(a.date);
      if (!b) continue;
      if (a.status === "Completed") {
        const price = a.service?.price ?? 0;
        const discount = a.couponRedemptions.reduce((s, r) => s + (r.usedAt ? r.discountAmount ?? 0 : 0), 0);
        b.revenue += Math.max(price - discount, 0);
        b.sessions += 1;
        if (a.customerId) b.customers.add(a.customerId);
      } else if (a.status === "Cancelled" || a.status === "NoShow") {
        b.cancelled += 1;
      }
    }
    for (const u of newUsers) {
      const b = bucketOf(u.createdAt);
      if (b) b.newCustomers += 1;
    }

    // recorrentes: dos clientes atendidos no mês, quantos já tinham sessão concluída antes dele
    async function returningRate(bucket) {
      const ids = [...bucket.customers];
      if (ids.length === 0) return null;
      const earlier = await prisma.appointment.findMany({
        where: { status: "Completed", customerId: { in: ids }, date: { lt: bucket.start } },
        select: { customerId: true },
      });
      const returning = new Set(earlier.map((e) => e.customerId));
      return round1((returning.size / ids.length) * 100);
    }

    const cur = buckets[buckets.length - 1];
    const prev = buckets[buckets.length - 2];
    const [curReturning, prevReturning] = await Promise.all([returningRate(cur), returningRate(prev)]);

    const ticket = (b) => (b.sessions > 0 ? b.revenue / b.sessions : 0);
    const cancelRate = (b) => {
      const resolved = b.sessions + b.cancelled;
      return resolved > 0 ? round1((b.cancelled / resolved) * 100) : 0;
    };
    // diferença em pontos percentuais (para métricas que já são %)
    const pp = (c, p) => (c == null || p == null ? null : round1(c - p));

    res.json({
      generatedAt: now,
      month: { key: cur.key, label: MONTH_LABELS[curM0], year: curY },
      cards: {
        revenue: { value: round2(cur.revenue), previous: round2(prev.revenue), change: pctChange(cur.revenue, prev.revenue), unit: "pct" },
        sessions: { value: cur.sessions, previous: prev.sessions, change: pctChange(cur.sessions, prev.sessions), unit: "pct" },
        averageTicket: { value: round2(ticket(cur)), previous: round2(ticket(prev)), change: pctChange(ticket(cur), ticket(prev)), unit: "pct" },
        newCustomers: { value: cur.newCustomers, previous: prev.newCustomers, change: pctChange(cur.newCustomers, prev.newCustomers), unit: "pct" },
        returningCustomers: { value: curReturning, previous: prevReturning, change: pp(curReturning, prevReturning), unit: "pp" },
        cancellationRate: { value: cancelRate(cur), previous: cancelRate(prev), change: pp(cancelRate(cur), cancelRate(prev)), unit: "pp" },
      },
      series: buckets.map((b) => ({
        key: b.key,
        label: b.label,
        year: b.year,
        revenue: round2(b.revenue),
        sessions: b.sessions,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o dashboard." });
  }
});

//=============================================================== RECEITAS (INSUMOS POR PROCEDIMENTO) + CONSUMO AUTOMÁTICO
// Como funciona:
// - Receita = RecipeItem (procedimento x produto x quantidade por execução).
// - Ao CONCLUIR um atendimento ("Completed"), cada insumo da receita vira uma
//   movimentação Consumption (negativa), tirada dos lotes:
//     * frascos já ABERTOS primeiro, depois o que vence primeiro (FEFO);
//     * lote vencido (ou frasco aberto fora da validade) NUNCA é usado;
//     * produto com controle de abertura: o lote usado pela 1ª vez é marcado
//       como aberto (na data do atendimento).
// - Ao sair de "Completed" (reabrir, cancelar, não compareceu) ou ao excluir o
//   atendimento, o consumo é ESTORNADO (Return) nos mesmos lotes.
// - Idempotente: só age quando o status muda (ou o procedimento muda num
//   atendimento concluído); salvar de novo não baixa o estoque duas vezes.
// - Falta de estoque NÃO trava o atendimento: baixa o que houver e devolve
//   `stockWarnings` na resposta (o estoque nunca fica negativo).

const CONSUMPTION_EPS = 0.0005;

// lote que pode ser usado em paciente: não vencido e, se aberto, dentro da validade pós-abertura
function isUsableForConsumption(batch, product, now) {
  if (batch.expiresAt && new Date(batch.expiresAt) <= now) return false;
  const openedExp = openedExpiresAt(batch, product);
  if (openedExp && openedExp <= now) return false;
  return true;
}

// termina o frasco aberto antes de abrir outro; dentro de cada grupo, FEFO
function sortForConsumption(batches) {
  return [...sortFefo(batches.filter((b) => b.openedAt)), ...sortFefo(batches.filter((b) => !b.openedAt))];
}

// consumo líquido já lançado para o atendimento, por lote: Consumption(-) + Return(+)
async function netConsumptionByBatch(tx, appointmentId) {
  const movements = await tx.stockMovement.findMany({
    where: { appointmentId, type: { in: ["Consumption", "Return"] } },
  });
  const byBatch = new Map();
  for (const m of movements) {
    if (!m.batchId) continue;
    const entry = byBatch.get(m.batchId) || { productId: m.productId, batchId: m.batchId, quantity: 0 };
    entry.quantity = round3(entry.quantity + m.quantity);
    byBatch.set(m.batchId, entry);
  }
  return [...byBatch.values()];
}

// devolve ao estoque tudo que o atendimento ainda tem consumido (no-op se não há nada)
async function revertAppointmentConsumption(tx, { appointmentId, staffId, reason }) {
  const consumed = (await netConsumptionByBatch(tx, appointmentId)).filter((e) => e.quantity < -CONSUMPTION_EPS);
  const perProduct = new Map();

  for (const e of consumed) {
    const amount = -e.quantity;
    await tx.stockBatch.update({ where: { id: e.batchId }, data: { quantity: { increment: amount } } });
    await tx.stockMovement.create({
      data: { type: "Return", productId: e.productId, batchId: e.batchId, appointmentId, staffId, quantity: amount, reason },
    });
    perProduct.set(e.productId, round3((perProduct.get(e.productId) || 0) + amount));
  }
  for (const [productId, amount] of perProduct) {
    await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: amount } } });
  }
  return consumed.length > 0;
}

// aplica a receita no estoque. Devolve a lista de avisos de falta.
async function consumeRecipe(tx, { appointment, recipe, staffId }) {
  const warnings = [];
  const now = new Date();
  // data em que um frasco novo é considerado aberto: a do atendimento (se já passou)
  const openedAt = new Date(Math.min(now.getTime(), new Date(appointment.date).getTime()));

  for (const item of recipe) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) continue;

    const needed = round3(item.quantity);
    let remaining = needed;
    let consumedTotal = 0;

    const batches = await tx.stockBatch.findMany({ where: { productId: product.id, quantity: { gt: 0 } } });
    const usable = sortForConsumption(batches.filter((b) => isUsableForConsumption(b, product, now)));

    for (const b of usable) {
      if (remaining <= 0) break;
      const take = round3(Math.min(b.quantity, remaining));
      if (take <= 0) continue;

      await decrementBatch(tx, b, take, product);
      if (product.trackOpening && !b.openedAt) {
        await tx.stockBatch.update({ where: { id: b.id }, data: { openedAt } });
      }
      await tx.stockMovement.create({
        data: {
          type: "Consumption",
          productId: product.id,
          batchId: b.id,
          appointmentId: appointment.id,
          staffId,
          quantity: -take,
          reason: `Atendimento: ${appointment.title}`,
        },
      });
      remaining = round3(remaining - take);
      consumedTotal = round3(consumedTotal + take);
    }

    if (consumedTotal > 0) {
      await tx.product.update({ where: { id: product.id }, data: { currentStock: { increment: -consumedTotal } } });
    }
    if (remaining > CONSUMPTION_EPS) {
      warnings.push({
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        needed,
        missing: remaining,
      });
    }
  }
  return warnings;
}

// Chamar DENTRO da transação que atualiza o atendimento.
// `before` = atendimento antes da mudança, `after` = depois (com status e serviceId).
async function syncAppointmentStock(tx, { before, after, staffId }) {
  const wasCompleted = before?.status === "Completed";
  const isCompleted = after.status === "Completed";
  const serviceChanged = (before?.serviceId ?? null) !== (after.serviceId ?? null);

  // nada relevante mudou: não mexe no estoque (garante a idempotência)
  if (wasCompleted === isCompleted && !(isCompleted && serviceChanged)) return { warnings: [], changed: false };

  const reverted = await revertAppointmentConsumption(tx, {
    appointmentId: after.id,
    staffId,
    reason: isCompleted ? "Estorno: procedimento do atendimento alterado" : `Estorno: atendimento deixou de estar concluído (${after.status})`,
  });
  if (!isCompleted || !after.serviceId) return { warnings: [], changed: reverted };

  const recipe = await tx.recipeItem.findMany({ where: { serviceId: after.serviceId } });
  if (recipe.length === 0) return { warnings: [], changed: reverted };

  const warnings = await consumeRecipe(tx, { appointment: after, recipe, staffId });
  return { warnings, changed: true };
}

//------------------------------------------------------------- helpers de receita
async function loadRecipe(serviceId) {
  const items = await prisma.recipeItem.findMany({ where: { serviceId } });
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const rows = items.map((i) => {
    const p = byId.get(i.productId);
    return {
      id: i.id,
      productId: i.productId,
      quantity: i.quantity,
      product: p
        ? { id: p.id, name: p.name, unit: p.unit, currentStock: p.currentStock, lastCost: p.lastCost, active: p.active }
        : null,
    };
  });
  return { serviceId, items: rows, ...recipeCost(rows) };
}

// custo estimado por execução = soma(quantidade x último custo por unidade base)
function recipeCost(rows) {
  let cost = 0;
  let complete = rows.length > 0;
  for (const r of rows) {
    const unitCost = r.product?.lastCost;
    if (unitCost == null) complete = false;
    else cost += r.quantity * unitCost;
  }
  return { cost: rows.length ? Math.round(cost * 100) / 100 : null, costComplete: complete };
}

//------------------------------------------------------------- GET ROUTE (resumo: nº de insumos e custo de cada procedimento - MajorAdmin)
app.get('/admin/recipes/summary', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const [items, products] = await Promise.all([prisma.recipeItem.findMany(), prisma.product.findMany()]);
    const byProduct = new Map(products.map((p) => [p.id, p]));

    const grouped = new Map();
    for (const i of items) {
      if (!grouped.has(i.serviceId)) grouped.set(i.serviceId, []);
      grouped.get(i.serviceId).push({ quantity: i.quantity, product: byProduct.get(i.productId) });
    }

    const summary = {};
    for (const [serviceId, rows] of grouped) {
      summary[serviceId] = { items: rows.length, ...recipeCost(rows) };
    }
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar receitas." });
  }
});

//------------------------------------------------------------- GET ROUTE (receita de um procedimento - MajorAdmin)
app.get('/services/:id/recipe', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!service) return res.status(404).json({ error: "Serviço não encontrado." });
    res.json(await loadRecipe(service.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar receita." });
  }
});

//------------------------------------------------------------- PUT ROUTE (substitui a receita inteira - MajorAdmin)
// Não é retroativa: atendimentos já concluídos mantêm o consumo que tiveram.
app.put('/services/:id/recipe', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length > 30) {
      return res.status(400).json({ error: "Envie a lista de insumos (até 30)." });
    }

    const service = await prisma.service.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!service) return res.status(404).json({ error: "Serviço não encontrado." });

    const seen = new Set();
    const data = [];
    for (const raw of items) {
      const productId = String(raw.productId || "");
      const quantity = Number(raw.quantity);
      if (!productId) return res.status(400).json({ error: "Escolha o produto de cada insumo." });
      if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: "A quantidade de cada insumo deve ser maior que zero." });
      if (seen.has(productId)) return res.status(400).json({ error: "Há um insumo repetido na receita." });
      seen.add(productId);
      data.push({ serviceId: service.id, productId, quantity: round3(quantity) });
    }

    const products = await prisma.product.findMany({ where: { id: { in: data.map((d) => d.productId) } }, select: { id: true } });
    if (products.length !== data.length) return res.status(400).json({ error: "Produto não encontrado." });

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { serviceId: service.id } });
      if (data.length > 0) await tx.recipeItem.createMany({ data });
    });

    res.json(await loadRecipe(service.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar receita." });
  }
});

const DAY_TZ_OFFSET_H = -3;
const DAY_MS = 24 * 3600 * 1000;
const dayRound2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const dayRound1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
// variação % ; sem base (anterior = 0) devolve null. Usa |anterior| p/ o líquido negativo.
const dayChange = (cur, prev) => (prev !== 0 ? dayRound1(((cur - prev) / Math.abs(prev)) * 100) : null);
 
// 00:00 do dia (fuso da clínica) que contém `date`, como Date UTC
function clinicDayStart(date) {
  const shifted = new Date(new Date(date).getTime() + DAY_TZ_OFFSET_H * 3600 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), -DAY_TZ_OFFSET_H));
}
 
async function daySnapshot(dayStart, { withEstimates = false } = {}) {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
 
  const appointments = await prisma.appointment.findMany({
    where: { date: { gte: dayStart, lt: dayEnd } },
    include: {
      service: { select: { id: true, price: true } },
      couponRedemptions: { select: { usedAt: true, discountAmount: true } },
    },
  });
  const active = appointments.filter((a) => a.status !== "Cancelled" && a.status !== "NoShow");
  const completed = active.filter((a) => a.status === "Completed");
 
  // consumo real (ledger) dos concluídos
  const movements = completed.length
    ? await prisma.stockMovement.findMany({
        where: { appointmentId: { in: completed.map((a) => a.id) }, type: { in: ["Consumption", "Return"] } },
        include: { batch: { select: { unitCost: true } }, product: { select: { lastCost: true } } },
      })
    : [];
 
  const costByAppointment = new Map();
  let costComplete = true;
  for (const m of movements) {
    const unit = m.unitCost ?? m.batch?.unitCost ?? m.product?.lastCost ?? null;
    if (unit == null) {
      costComplete = false;
      continue;
    }
    costByAppointment.set(m.appointmentId, (costByAppointment.get(m.appointmentId) || 0) + -m.quantity * unit);
  }
 
  // custo previsto (receita x último custo) dos que ainda não foram concluídos
  const estimateByService = new Map();
  if (withEstimates) {
    const serviceIds = [...new Set(active.filter((a) => a.status !== "Completed" && a.serviceId).map((a) => a.serviceId))];
    if (serviceIds.length) {
      const items = await prisma.recipeItem.findMany({ where: { serviceId: { in: serviceIds } } });
      const products = await prisma.product.findMany({ where: { id: { in: [...new Set(items.map((i) => i.productId))] } } });
      const byProduct = new Map(products.map((p) => [p.id, p]));
      for (const sid of serviceIds) {
        const rows = items.filter((i) => i.serviceId === sid);
        let cost = 0;
        let complete = true;
        for (const r of rows) {
          const unit = byProduct.get(r.productId)?.lastCost;
          if (unit == null) complete = false;
          else cost += r.quantity * unit;
        }
        estimateByService.set(sid, { items: rows.length, cost: dayRound2(cost), complete });
      }
    }
  }
 
  const chargedOf = (a) => {
    const price = a.service?.price ?? 0;
    const discount = (a.couponRedemptions || []).reduce((s, r) => s + (r.usedAt ? r.discountAmount ?? 0 : 0), 0);
    return { price, discount, charged: Math.max(price - discount, 0) };
  };
 
  let revenue = 0;
  let supplies = 0;
  const byAppointment = {};
  for (const a of active) {
    const money = chargedOf(a);
    const isDone = a.status === "Completed";
    if (isDone) {
      revenue += money.charged;
      supplies += costByAppointment.get(a.id) || 0;
    }
    if (withEstimates) {
      const est = !isDone && a.serviceId ? estimateByService.get(a.serviceId) : null;
      byAppointment[a.id] = {
        price: a.service ? money.price : null,
        discount: dayRound2(money.discount),
        charged: a.service ? dayRound2(money.charged) : null,
        suppliesCost: isDone ? dayRound2(costByAppointment.get(a.id) || 0) : est && est.items > 0 ? est.cost : null,
        suppliesEstimated: !isDone && !!est && est.items > 0,
        suppliesComplete: isDone ? costComplete : est ? est.complete : true,
      };
    }
  }
  revenue = dayRound2(revenue);
  supplies = dayRound2(supplies);
  return { sessions: active.length, revenue, supplies, net: dayRound2(revenue - supplies), costComplete, byAppointment };
}
 
app.get('/staff/day-summary', authenticateToken, requireStaff, async (req, res) => {
  try {
    const today = clinicDayStart(new Date());
    const lastWeek = new Date(today.getTime() - 7 * DAY_MS);
    const [cur, prev] = await Promise.all([daySnapshot(today, { withEstimates: true }), daySnapshot(lastWeek)]);
 
    const metric = (key) => ({ value: cur[key], compare: prev[key], change: dayChange(cur[key], prev[key]) });
    res.json({
      date: today.toISOString(),
      compareDate: lastWeek.toISOString(),
      sessions: metric("sessions"),
      revenue: metric("revenue"),
      supplies: metric("supplies"),
      net: metric("net"),
      costComplete: cur.costComplete,
      byAppointment: cur.byAppointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o resumo do dia." });
  }
});

server.listen(3000, () => console.log("Server running on port 3000 (HTTP + WebSocket)"));
