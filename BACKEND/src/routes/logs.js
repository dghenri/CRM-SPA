import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AUDIT_MODELS, RETENTION_DAYS } from '../lib/audit.js';
import { requirePermission, stockAuth } from '../middleware/auth.js';

const router = Router();

const ACTIONS = ['create', 'update', 'delete', 'login', 'login_failed'];

// "2026-10-25" -> início/fim desse dia no horário de Brasília (UTC-3, sem horário de verão)
function dayStartBRT(value) {
  const d = new Date(`${value}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

//------------------------------------------------------------- GET ROUTE (logs.view)
// ?page=1&pageSize=25&action=update&model=Staff&q=maria&from=2026-10-01&to=2026-10-25
router.get('/admin/logs', ...stockAuth, requirePermission('logs.view'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const { action, model, q, from, to } = req.query;

    const where = {};
    if (ACTIONS.includes(action)) where.action = action;
    if (model && AUDIT_MODELS.some((m) => m.id === model)) where.model = model;

    const start = from ? dayStartBRT(from) : null;
    const end = to ? dayStartBRT(to) : null;
    if (start || end) {
      where.createdAt = {};
      if (start) where.createdAt.gte = start;
      if (end) where.createdAt.lt = new Date(end.getTime() + 24 * 3600 * 1000);
    }

    const text = typeof q === 'string' ? q.trim() : '';
    if (text) {
      where.OR = [
        { summary: { contains: text, mode: 'insensitive' } },
        { actorName: { contains: text, mode: 'insensitive' } },
        { entityLabel: { contains: text, mode: 'insensitive' } },
        { entityId: text },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      models: AUDIT_MODELS,
      retentionDays: RETENTION_DAYS,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar os logs." });
  }
});

export default router;
