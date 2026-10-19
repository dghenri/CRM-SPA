import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_KEY } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { MAJOR_ADMIN } from '../services/stock.js';
import { isSessionRevoked } from '../lib/sessionRevocation.js';

//------------------------------------------------------------- MIDDLEWARE (JWT AUTH)
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Não autorizado." });

  jwt.verify(token, ACCESS_TOKEN_KEY, async (err, decoded) => {
    if (err) return res.status(401).json({ error: "Sessão expirada." });

    // "Sair de outros dispositivos": token emitido antes da data marcada na conta não vale mais
    try {
      if (await isSessionRevoked(decoded)) {
        return res.status(401).json({ error: "Sessão encerrada. Entre novamente." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao validar a sessão." });
    }

    req.user = decoded;
    next();
  });
}

// Usar SEMPRE depois de authenticateToken - garante que o token é de um
// membro da equipe (Staff) e não de um cliente (User)
export function requireStaff(req, res, next) {
  if (req.user?.type !== "staff") {
    return res.status(403).json({ error: "Acesso restrito à equipe." });
  }
  next();
}

// Usar SEMPRE depois de authenticateToken - garante que o token é de um
// cliente (User) e não de um membro da equipe (Staff)
export function requireUser(req, res, next) {
  if (req.user?.type !== "user") {
    return res.status(403).json({ error: "Acesso restrito a clientes." });
  }
  next();
}

//------------------------------------------------------------- MIDDLEWARE (EQUIPE / ESTOQUE)
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
export function requireMajorAdmin(req, res, next) {
  if (req.staff?.role !== MAJOR_ADMIN) {
    return res.status(403).json({ error: "Apenas o MajorAdmin pode fazer isso." });
  }
  next();
}

export const stockAuth = [authenticateToken, requireStaff, loadStaff];
