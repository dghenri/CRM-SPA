import { AsyncLocalStorage } from 'node:async_hooks';

// Guarda, durante UMA requisição, quem está agindo e de onde veio.
// A extensão do Prisma (lib/prisma.js) lê isso pra saber o autor de cada escrita,
// sem precisar passar "req" por todas as funções.
const storage = new AsyncLocalStorage();

// middleware: precisa vir DEPOIS do express.json() (o body-parser perde o contexto assíncrono)
export function auditContextMiddleware(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.ip || null;
  storage.run({ actor: null, ip, method: req.method, path: req.originalUrl?.split('?')[0] ?? null }, next);
}

export function getAuditContext() {
  return storage.getStore() ?? null;
}

// chamado pelo authenticateToken quando o JWT é válido ({ id, type: "staff" | "user" })
export function setAuditActor(decoded) {
  const store = storage.getStore();
  if (store && decoded?.id) store.actor = { type: decoded.type ?? null, id: decoded.id };
}
