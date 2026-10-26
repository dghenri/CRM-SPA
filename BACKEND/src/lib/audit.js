import { getAuditContext } from './auditContext.js';

// Trilha de auditoria: registra quem mudou o quê, e quando.
// A captura das escritas é automática (extensão do Prisma em lib/prisma.js);
// eventos que não são escrita (login, falha de login) usam logEvent().
// Auditar NUNCA pode derrubar a requisição: toda falha aqui só vai pro console.

// tabelas que não entram na trilha
export const EXCLUDED_MODELS = new Set([
  'AuditLog',
  'Notification',   // geradas em massa por disparos/agendamentos (o disparo em si é NotificationBroadcast)
  'PasswordReset',  // tokens de recuperação de senha
]);

// campos que, sozinhos, não contam como "mudança" (evita log a cada login/save sem alteração real)
const IGNORED_FIELDS = new Set(['updatedAt', 'lastLogin']);

// valores nunca gravados: aparecem como "[oculto]" (a mudança fica visível, o conteúdo não)
const REDACTED_FIELDS = new Set(['password', 'passwordHash', 'token', 'tokenHash']);

// retenção
export const RETENTION_DAYS = 180;

const MODEL_LABEL = {
  Staff: 'funcionário',
  Profession: 'profissão',
  StaffAvailability: 'disponibilidade',
  User: 'cliente',
  Address: 'endereço',
  Coupon: 'cupom',
  CouponRedemption: 'uso de cupom',
  Appointment: 'agendamento',
  Service: 'procedimento',
  Product: 'produto',
  StockBatch: 'lote de estoque',
  StockMovement: 'movimentação de estoque',
  StockRequest: 'solicitação de estoque',
  RecipeItem: 'item de receita',
  NotificationBroadcast: 'disparo de notificação',
  Banner: 'banner',
};
export const modelLabel = (model) => MODEL_LABEL[model] ?? model;
export const AUDIT_MODELS = Object.entries(MODEL_LABEL).map(([id, label]) => ({ id, label }));

const VERB = { create: 'Criou', update: 'Editou', delete: 'Excluiu' };

//------------------------------------------------------------- helpers
function clean(value, depth = 0) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => clean(v, depth + 1));
  if (typeof value === 'object') {
    if (depth > 3) return '[…]';
    if (typeof value.toJSON === 'function') return clean(value.toJSON(), depth + 1); // ObjectId, Decimal...
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACTED_FIELDS.has(k) ? '[oculto]' : clean(v, depth + 1);
    return out;
  }
  return value;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// só os campos que mudaram (ignorando os de ruído): { before: {...}, after: {...} }
export function diffRecords(before, after) {
  const beforeOut = {};
  const afterOut = {};
  // só compara os campos que existem no "antes" (colunas do registro): se a rota fez `include` de
  // relações, elas vêm só no "depois" e gerariam diferenças falsas
  const keys = before ? Object.keys(before) : Object.keys(after ?? {});
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const a = REDACTED_FIELDS.has(key) ? (before?.[key] === undefined ? null : '[oculto]') : clean(before?.[key]);
    const b = REDACTED_FIELDS.has(key) ? (after?.[key] === undefined ? null : '[oculto]') : clean(after?.[key]);
    // senha: o hash muda sempre que é regravada, então compara os valores reais
    const changed = REDACTED_FIELDS.has(key) ? !same(before?.[key], after?.[key]) : !same(a, b);
    if (!changed) continue;
    beforeOut[key] = a;
    afterOut[key] = b;
  }
  return { before: beforeOut, after: afterOut };
}

function snapshot(record) {
  return record ? clean(record) : null;
}

function labelOf(record) {
  if (!record) return null;
  return record.name ?? record.title ?? record.code ?? record.email ?? record.lotNumber ?? null;
}

//------------------------------------------------------------- quem fez
const actorCache = new Map(); // id -> { at, data }
const ACTOR_TTL_MS = 60_000;

async function resolveActor(base, actor) {
  if (!actor?.id) return { actorType: 'system', actorId: null, actorName: 'Sistema', actorRole: null };
  const hit = actorCache.get(actor.id);
  if (hit && Date.now() - hit.at < ACTOR_TTL_MS) return hit.data;
  let data = { actorType: actor.type ?? null, actorId: actor.id, actorName: null, actorRole: null };
  try {
    if (actor.type === 'staff') {
      const s = await base.staff.findUnique({ where: { id: actor.id }, select: { name: true, role: true } });
      data = { ...data, actorName: s?.name ?? null, actorRole: s?.role ?? null };
    } else if (actor.type === 'user') {
      const u = await base.user.findUnique({ where: { id: actor.id }, select: { name: true } });
      data = { ...data, actorName: u?.name ?? null, actorRole: 'Cliente' };
    }
  } catch (error) {
    console.error('[audit] não foi possível resolver o autor:', error.message);
  }
  actorCache.set(actor.id, { at: Date.now(), data });
  return data;
}

//------------------------------------------------------------- escrita do log
let baseClient = null;
export function bindAuditClient(base) {
  baseClient = base;
}

async function write(entry, actorOverride) {
  if (!baseClient) return;
  const ctx = getAuditContext();
  const actor = await resolveActor(baseClient, actorOverride ?? ctx?.actor);
  await baseClient.auditLog.create({
    data: {
      ...entry,
      // Json opcional: sem valor = omitir (null puro não é aceito pelo Prisma em campos Json)
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      ...actor,
      ip: ctx?.ip ?? null,
      method: ctx?.method ?? null,
      path: ctx?.path ?? null,
    },
  });
}

function fire(entry, actorOverride) {
  write(entry, actorOverride).catch((error) => console.error('[audit] falha ao gravar o log:', error.message));
}

// chamado pela extensão do Prisma depois de cada escrita bem-sucedida
// { model, action: create|update|delete|updateMany|deleteMany|createMany, before, after, result, count }
export function recordWrite({ model, action, before, after, count, ids }) {
  if (EXCLUDED_MODELS.has(model)) return;
  const what = modelLabel(model);

  if (action === 'create' || action === 'delete') {
    const record = action === 'create' ? after : before;
    const label = labelOf(record);
    fire({
      action,
      model,
      entityId: record?.id ?? null,
      entityLabel: label,
      summary: `${VERB[action]} ${what}${label ? ` "${label}"` : ''}`,
      before: action === 'delete' ? snapshot(before) : null,
      after: action === 'create' ? snapshot(after) : null,
    }, action === 'create' && model === 'User' && !getAuditContext()?.actor && after?.id
      ? { type: 'user', id: after.id } // cadastro do próprio cliente
      : undefined);
    return;
  }

  if (action === 'update') {
    const diff = diffRecords(before, after);
    const fields = Object.keys(diff.after);
    if (fields.length === 0) return; // nada mudou de verdade
    const label = labelOf(after) ?? labelOf(before);
    fire({
      action: 'update',
      model,
      entityId: after?.id ?? before?.id ?? null,
      entityLabel: label,
      summary: `${VERB.update} ${what}${label ? ` "${label}"` : ''} (${fields.join(', ')})`,
      before: diff.before,
      after: diff.after,
    });
    return;
  }

  // operações em lote: um registro só, com a contagem e os ids afetados
  const verb = action === 'deleteMany' ? 'Excluiu' : action === 'createMany' ? 'Criou' : 'Editou';
  fire({
    action: action === 'deleteMany' ? 'delete' : action === 'createMany' ? 'create' : 'update',
    model,
    entityId: null,
    entityLabel: null,
    summary: `${verb} ${count ?? '?'} registro(s) de ${what} (em lote)`,
    before: null,
    after: clean({ count, ids }),
  });
}

// eventos que não são escrita no banco: login, falha de login...
// actor: { type: 'staff'|'user', id } (opcional; sem ele usa o autor da requisição)
export function logEvent({ action, summary, actor, entityLabel = null, after = null }) {
  fire({ action, model: null, entityId: actor?.id ?? null, entityLabel, summary, before: null, after: clean(after) }, actor);
}

//------------------------------------------------------------- retenção
export function startAuditRetention() {
  const purge = async () => {
    if (!baseClient) return;
    try {
      const limit = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
      const { count } = await baseClient.auditLog.deleteMany({ where: { createdAt: { lt: limit } } });
      if (count) console.log(`[audit] ${count} log(s) com mais de ${RETENTION_DAYS} dias removido(s).`);
    } catch (error) {
      console.error('[audit] falha na limpeza de logs antigos:', error.message);
    }
  };
  setTimeout(purge, 30_000).unref();
  setInterval(purge, 24 * 3600 * 1000).unref();
}
