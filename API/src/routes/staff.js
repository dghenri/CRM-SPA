import { Router } from 'express';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ACCESS_TOKEN_KEY } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { DEFAULT_STAFF_SETTINGS, toPublicStaff } from '../lib/serializers.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

//------------------------------------------------------------- POST ROUTE (CREATE STAFF)
router.post('/staff', async (req, res) => {
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
router.get('/auth/staff/me', authenticateToken, async (req, res) => {
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
router.get('/staff', authenticateToken, async (req, res) => {
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
router.put('/staff/:id', authenticateToken, async (req, res) => {
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
router.delete('/staff/:id', authenticateToken, async (req, res) => {
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

export default router;
