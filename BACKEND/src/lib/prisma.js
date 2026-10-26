import { PrismaClient } from '@prisma/client';
import { EXCLUDED_MODELS, bindAuditClient, recordWrite } from './audit.js';

// Cliente "puro": usado só pela auditoria (gravar logs sem gerar logs dos logs).
const base = new PrismaClient();
bindAuditClient(base);

const delegate = (model) => base[model.charAt(0).toLowerCase() + model.slice(1)];
const BATCH_CAP = 200; // máximo de ids guardados num log em lote

// Cliente da aplicação: igual ao Prisma de sempre, mas toda escrita (create/update/delete)
// vira um registro em AuditLog. Leituras não são registradas.
export const prisma = base.$extends({
  name: 'audit-log',
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const result = await query(args);
        if (!EXCLUDED_MODELS.has(model)) recordWrite({ model, action: 'create', after: result });
        return result;
      },

      async update({ model, args, query }) {
        if (EXCLUDED_MODELS.has(model)) return query(args);
        let before = null;
        try { before = await delegate(model).findUnique({ where: args.where }); } catch { /* sem "antes": só perde o diff */ }
        const result = await query(args);
        recordWrite({ model, action: 'update', before, after: result });
        return result;
      },

      async upsert({ model, args, query }) {
        if (EXCLUDED_MODELS.has(model)) return query(args);
        let before = null;
        try { before = await delegate(model).findUnique({ where: args.where }); } catch { /* idem */ }
        const result = await query(args);
        recordWrite(before
          ? { model, action: 'update', before, after: result }
          : { model, action: 'create', after: result });
        return result;
      },

      async delete({ model, args, query }) {
        const result = await query(args); // delete devolve o registro apagado
        if (!EXCLUDED_MODELS.has(model)) recordWrite({ model, action: 'delete', before: result });
        return result;
      },

      async createMany({ model, args, query }) {
        const result = await query(args);
        if (!EXCLUDED_MODELS.has(model)) recordWrite({ model, action: 'createMany', count: result?.count });
        return result;
      },

      async updateMany({ model, args, query }) {
        if (EXCLUDED_MODELS.has(model)) return query(args);
        let ids = [];
        try {
          ids = (await delegate(model).findMany({ where: args.where, select: { id: true }, take: BATCH_CAP })).map((r) => r.id);
        } catch { /* sem ids */ }
        const result = await query(args);
        if (result?.count) recordWrite({ model, action: 'updateMany', count: result.count, ids });
        return result;
      },

      async deleteMany({ model, args, query }) {
        if (EXCLUDED_MODELS.has(model)) return query(args);
        let ids = [];
        try {
          ids = (await delegate(model).findMany({ where: args.where, select: { id: true }, take: BATCH_CAP })).map((r) => r.id);
        } catch { /* sem ids */ }
        const result = await query(args);
        if (result?.count) recordWrite({ model, action: 'deleteMany', count: result.count, ids });
        return result;
      },
    },
  },
});
