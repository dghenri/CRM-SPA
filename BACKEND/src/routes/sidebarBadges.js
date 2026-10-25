import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { hasPermission } from '../lib/permissions.js';
import { stockAuth } from '../middleware/auth.js';

const router = Router();

// Contadores dos badges da sidebar da equipe, num único request (1 chamada em vez de 7).
// Cada número respeita o que a pessoa pode ver:
//  - scheduling: sessões do DIA em Agendada/Confirmada. Quem tem appointments.viewAll vê as de todos;
//    os demais só as próprias (mesma regra da tela de Cronograma).
//  - overview: só é calculado para quem tem overview.view (senão 0).

// Brasil (America/Sao_Paulo) está em UTC-3 o ano todo (sem horário de verão desde 2019).
const BRT_OFFSET_HOURS = 3;
// "Comunicação" soma banners ativos + disparos (notificações) da equipe feitos nesta janela.
const RECENT_BROADCAST_DAYS = 7;

function todayBoundsBRT(now = new Date()) {
  const brt = new Date(now.getTime() - BRT_OFFSET_HOURS * 3600 * 1000);
  const startUtc = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), BRT_OFFSET_HOURS);
  return { start: new Date(startUtc), end: new Date(startUtc + 24 * 3600 * 1000) };
}

//------------------------------------------------------------- GET ROUTE
router.get('/staff/sidebar-badges', ...stockAuth, async (req, res) => {
  try {
    const now = new Date();
    const { start, end } = todayBoundsBRT(now);
    const canSeeAll = hasPermission(req.staff, "appointments.viewAll");
    const canSeeOverview = hasPermission(req.staff, "overview.view");
    const recentSince = new Date(now.getTime() - RECENT_BROADCAST_DAYS * 24 * 3600 * 1000);

    const [scheduling, services, coupons, products, banners, broadcasts, pendingRequests] = await Promise.all([
      prisma.appointment.count({
        where: {
          date: { gte: start, lt: end },
          status: { in: ["Scheduled", "Confirmed"] },
          ...(canSeeAll ? {} : { professionalId: req.staff.id }),
        },
      }),
      prisma.service.count({ where: { available: true } }),
      // cupom ativo = não arquivado, já iniciado, não expirado e com usos sobrando
      prisma.coupon.findMany({
        where: { archivedAt: null },
        select: { startsAt: true, expiresAt: true, usageLimit: true, usageCount: true },
      }),
      prisma.product.findMany({
        where: { active: true },
        select: { minStock: true, currentStock: true },
      }),
      prisma.banner.count({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      }),
      prisma.notificationBroadcast.count({ where: { createdAt: { gte: recentSince } } }),
      canSeeOverview ? prisma.stockRequest.count({ where: { status: "Pending" } }) : 0,
    ]);

    const activeCoupons = coupons.filter(
      (c) =>
        (!c.startsAt || c.startsAt <= now) &&
        (!c.expiresAt || c.expiresAt >= now) &&
        (c.usageLimit == null || c.usageCount < c.usageLimit)
    ).length;

    // mesma regra do alerts.lowStock de GET /products: tem mínimo definido e o saldo chegou nele
    const lowStock = canSeeOverview
      ? products.filter((p) => p.minStock > 0 && p.currentStock <= p.minStock).length
      : 0;

    res.json({
      scheduling,
      services,
      coupons: activeCoupons,
      stock: products.length,
      communication: banners + broadcasts,
      stockRequests: pendingRequests, // Overview (amarelo)
      stockAlerts: lowStock,          // Overview (vermelho)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar os contadores." });
  }
});

export default router;
