import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import { loadStaffActor, scopeWhere } from '../lib/appointmentAccess.js';

const router = Router();

//=============================================================== STAFF: RESUMO FINANCEIRO DO DIA (HOME)
//
// Regras (dia fechado no fuso da clínica, America/Bahia = UTC-3):
// - Sessões  = agendamentos do dia que não foram Cancelled/NoShow.
// - Entradas = faturamento: preço do serviço - desconto de cupom, só dos
//   atendimentos "Completed" do dia.
// - Saídas   = custo dos insumos consumidos pelos atendimentos "Completed" do dia
//   (consumo - estornos; custo = custo do lote, ou do último custo do produto).
// - Líquido  = Entradas - Saídas.
// - Comparação = MESMO dia da semana, 7 dias antes. Sem base (valor 0) => change: null.
// - byAppointment: valores de cada atendimento do dia (para o card "Sessão atual").
//   Atendimento ainda não concluído mostra o custo PREVISTO pela receita
//   (suppliesEstimated: true); concluído mostra o consumo real.

// Escopo por profissional: Admin vê o dia da clínica inteira; as demais
// funcionárias só veem as sessões em que são a profissional responsável.
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

async function daySnapshot(dayStart, scope, { withEstimates = false } = {}) {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const appointments = await prisma.appointment.findMany({
    where: { ...scope, date: { gte: dayStart, lt: dayEnd } },
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
        status: a.status,
        startedAt: a.startedAt ?? null,
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
  return { sessions: active.length, completedCount: completed.length, revenue, supplies, net: dayRound2(revenue - supplies), costComplete, byAppointment };
}

router.get('/staff/day-summary', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const today = clinicDayStart(new Date());
    const lastWeek = new Date(today.getTime() - 7 * DAY_MS);
    const scope = scopeWhere(req.actor);
    const [cur, prev] = await Promise.all([daySnapshot(today, scope, { withEstimates: true }), daySnapshot(lastWeek, scope)]);

    const metric = (key) => ({ value: cur[key], compare: prev[key], change: dayChange(cur[key], prev[key]) });
    res.json({
      date: today.toISOString(),
      compareDate: lastWeek.toISOString(),
      sessions: metric("sessions"),
      revenue: metric("revenue"),
      supplies: metric("supplies"),
      net: metric("net"),
      // quantos atendimentos do dia estão com status "Completed" (só eles entram em Entradas/Saídas)
      completedCount: cur.completedCount,
      costComplete: cur.costComplete,
      byAppointment: cur.byAppointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o resumo do dia." });
  }
});

export default router;
