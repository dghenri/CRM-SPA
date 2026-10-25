import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { broadcastStockChanged } from '../lib/realtime.js';
import { requirePermission, stockAuth } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';
import { StockError, applyStockItems, normalizeRequestItems, requestInclude, serializeRequests } from '../services/stock.js';

const router = Router();

//=============================================================== SOLICITAÇÕES DE ESTOQUE

//------------------------------------------------------------- POST ROUTE (cria solicitação; Admin aplica direto)
router.post('/stock/requests', ...stockAuth, async (req, res) => {
  try {
    const { type, items, reason } = req.body;
    const normalized = await normalizeRequestItems(type, items, req.staff);
    const isAdmin = hasPermission(req.staff, "stock.review");

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

//------------------------------------------------------------- GET ROUTE (Admin vê todas; demais veem só as próprias)
router.get('/stock/requests', ...stockAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const isAdmin = hasPermission(req.staff, "stock.review");

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

//------------------------------------------------------------- PATCH ROUTE (Admin aprova: aplica no estoque, tudo-ou-nada)
router.patch('/stock/requests/:id/approve', ...stockAuth, requirePermission('stock.review'), async (req, res) => {
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
      // Responsável no histórico = quem SOLICITOU. Quem aprovou fica na própria
      // solicitação (reviewedBy) e a movimentação aponta para ela (requestId).
      await applyStockItems(tx, {
        type: request.type, items: request.items, staffId: request.requestedById,
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

//------------------------------------------------------------- PATCH ROUTE (Admin nega)
router.patch('/stock/requests/:id/reject', ...stockAuth, requirePermission('stock.review'), async (req, res) => {
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
router.patch('/stock/requests/:id/cancel', ...stockAuth, async (req, res) => {
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

//------------------------------------------------------------- GET ROUTE (Admin: histórico/auditoria do ledger)
router.get('/stock/movements', ...stockAuth, requirePermission('stock.review'), async (req, res) => {
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

export default router;
