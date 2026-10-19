import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_KEY } from '../lib/config.js';
import { authenticateToken } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { validatePassword } from '../lib/passwordPolicy.js';
import { sendPasswordResetEmail } from '../lib/mailer.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();

/* ---------------------------------------------------------------------------
 * Recuperação de senha (cliente e colaborador)
 *
 *   POST /auth/password/forgot        { email, accountType? }  pede o link por e-mail
 *   POST /auth/password/reset/verify  { token }                confere se o link ainda vale
 *   POST /auth/password/reset         { token, password, logoutAllSessions? }  define a nova senha
 *   POST /auth/sessions/revoke-others (logado)                 desconecta os OUTROS dispositivos
 *
 * Segurança:
 *  - o token é aleatório (256 bits) e só o HASH (sha256) fica no banco: quem ler o banco
 *    não consegue usar os links;
 *  - vale 30 min e é de uso único (consumido de forma atômica);
 *  - /forgot responde SEMPRE a mesma coisa, exista a conta ou não (não revela quem é cadastrado);
 *  - limite de tentativas por IP e intervalo mínimo de 60 s entre e-mails da mesma conta;
 *  - a nova senha passa pela mesma política de senha forte do cadastro.
 * ------------------------------------------------------------------------- */

const TOKEN_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const FRONTEND_URL = () => (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_OK = { message: 'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.' };
const INVALID_LINK = { valid: false, error: 'Este link é inválido ou expirou. Peça um novo.' };

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// cliente = User, colaborador = Staff
const ACCOUNT_TYPES = { cliente: 'user', colaborador: 'staff' };
const findAccount = (type, id) => (type === 'staff' ? prisma.staff : prisma.user).findUnique({ where: { id } });
const findByEmail = (type, email) =>
  (type === 'staff' ? prisma.staff : prisma.user).findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

async function sendResetFor(type, email) {
  const account = await findByEmail(type, email);
  if (!account || account.status === 'Inactive') return; // sem conta (ou desativada): silêncio

  // evita disparar vários e-mails seguidos para a mesma conta
  const last = await prisma.passwordReset.findFirst({
    where: { accountType: type, accountId: account.id },
    orderBy: { createdAt: 'desc' },
  });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) return;

  // um pedido novo invalida os links anteriores ainda não usados
  await prisma.passwordReset.deleteMany({ where: { accountType: type, accountId: account.id, usedAt: null } });

  const raw = crypto.randomBytes(32).toString('base64url');
  await prisma.passwordReset.create({
    data: {
      tokenHash: hashToken(raw),
      accountType: type,
      accountId: account.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  await sendPasswordResetEmail({
    to: account.email,
    name: account.name,
    link: `${FRONTEND_URL()}/reset-password?token=${raw}`,
    minutes: TOKEN_TTL_MS / 60000,
  });
}

//------------------------------------------------------------- POST /auth/password/forgot
router.post('/auth/password/forgot', rateLimit({ name: 'forgot', windowMs: 15 * 60 * 1000, max: 8 }), async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 160) {
    return res.status(400).json({ error: 'Digite um e-mail válido.' });
  }

  // a aba do login diz o tipo; sem dica (ex: abriu /recovery direto) procura nos dois
  const hinted = ACCOUNT_TYPES[req.body?.accountType];
  const types = hinted ? [hinted] : ['user', 'staff'];

  // responde já, igual para qualquer caso; o envio acontece depois
  res.status(200).json(GENERIC_OK);

  for (const type of types) {
    try {
      await sendResetFor(type, email);
    } catch (error) {
      console.error('[password/forgot]', error);
    }
  }
});

//------------------------------------------------------------- POST /auth/password/reset/verify
async function findValidReset(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return null;
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  return record;
}

router.post('/auth/password/reset/verify', rateLimit({ name: 'verify', windowMs: 15 * 60 * 1000, max: 30 }), async (req, res) => {
  try {
    const record = await findValidReset(req.body?.token);
    if (!record) return res.status(400).json(INVALID_LINK);
    res.status(200).json({ valid: true });
  } catch (error) {
    console.error('[password/verify]', error);
    res.status(500).json({ error: 'Erro ao verificar o link.' });
  }
});

//------------------------------------------------------------- POST /auth/password/reset
router.post('/auth/password/reset', rateLimit({ name: 'reset', windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { token, password, logoutAllSessions } = req.body ?? {};
    const record = await findValidReset(token);
    if (!record) return res.status(400).json(INVALID_LINK);

    const account = await findAccount(record.accountType, record.accountId);
    if (!account || account.status === 'Inactive') return res.status(400).json(INVALID_LINK);

    const problems = validatePassword(password, { name: account.name, email: account.email });
    if (problems.length) return res.status(400).json({ error: problems[0], problems });

    // "consome" o link de forma atômica: se duas requisições chegarem juntas, só uma passa
    const claimed = await prisma.passwordReset.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return res.status(400).json(INVALID_LINK);

    try {
      const hashed = await bcrypt.hash(password, 10);
      await (record.accountType === 'staff' ? prisma.staff : prisma.user).update({
        where: { id: account.id },
        // logoutAllSessions: encerra todas as sessões abertas dessa conta (tokens antigos deixam de valer)
        data: { password: hashed, ...(logoutAllSessions ? { sessionsValidFrom: new Date() } : {}) },
      });
    } catch (error) {
      // não conseguiu trocar a senha: devolve o link para a pessoa tentar de novo
      await prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: null } }).catch(() => {});
      throw error;
    }

    // qualquer outro link pendente dessa conta deixa de valer
    await prisma.passwordReset.deleteMany({ where: { accountType: record.accountType, accountId: account.id, usedAt: null } });

    res.status(200).json({ message: 'Senha redefinida com sucesso. Entre com a nova senha.' });
  } catch (error) {
    console.error('[password/reset]', error);
    res.status(500).json({ error: 'Não foi possível redefinir a senha. Tente novamente.' });
  }
});

//------------------------------------------------------------- POST /auth/sessions/revoke-others
// Para quem JÁ está logado (cliente ou colaborador) e trocou a senha marcando "sair de outros
// dispositivos": invalida todos os tokens emitidos até agora e devolve um token NOVO só para
// este navegador, que continua logado. O front guarda o token devolvido.
router.post('/auth/sessions/revoke-others', authenticateToken, rateLimit({ name: 'revoke', windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { id, email, type } = req.user ?? {};
    if (!id || (type !== 'staff' && type !== 'user')) return res.status(401).json({ error: 'Sessão inválida.' });

    // tokens com iat <= agora ficam inválidos; o novo é emitido DEPOIS (iat maior ou igual no mesmo segundo passa)
    const now = new Date();
    await (type === 'staff' ? prisma.staff : prisma.user).update({ where: { id }, data: { sessionsValidFrom: now } });

    // mantém o prazo restante da sessão atual (ex: "lembrar de mim" por 30 dias)
    const remaining = req.user.exp ? Math.max(60, req.user.exp - Math.floor(Date.now() / 1000)) : 24 * 60 * 60;
    const token = jwt.sign({ id, email, type }, ACCESS_TOKEN_KEY, { expiresIn: remaining });

    res.status(200).json({ token, message: 'Os outros dispositivos foram desconectados.' });
  } catch (error) {
    console.error('[sessions/revoke-others]', error);
    res.status(500).json({ error: 'Não foi possível desconectar os outros dispositivos.' });
  }
});

export default router;
