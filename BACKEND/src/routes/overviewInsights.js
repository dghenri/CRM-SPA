import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requirePermission, stockAuth } from '../middleware/auth.js';
import { getStaffActor, scopeWhere } from '../lib/appointmentAccess.js';
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  addDays,
  addHours,
  clinicMonthStartUtc,
  clinicParts,
  clinicYearStartUtc,
  fmtDayMonth,
  pad2,
  startOfClinicDay,
  startOfClinicWeek,
} from '../lib/clinicTime.js';

const router = Router();

//=============================================================== ADMIN: OVERVIEW - GRÁFICO, CUPONS E CLIENTES
//
// Mesmas regras do /admin/overview: faturamento e sessões vêm de agendamentos
// "Completed" (faturamento = preço do serviço - desconto de cupom usado).
// Tudo no fuso da clínica (UTC-3).

const round2 = (n) => Math.round(n * 100) / 100;

//------------------------------------------------------------- períodos
// "Hoje" conta desde 00:00 de hoje; os demais, janelas que terminam agora.
const CHART_RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

// janela dos cards de cupom/clientes: { start (ou null = tudo), end = agora }
export const CARD_PERIODS = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365, ALL: null };
export function periodStart(period, now) {
  const days = CARD_PERIODS[period];
  if (days === null) return null;
  return addDays(startOfClinicDay(now), -(days - 1)); // inclui hoje
}

//------------------------------------------------------------- GRÁFICO
// Granularidade por período: 1D = horas | 1W e 1M = dias | 3M = semanas (seg-dom)
// | 1Y = meses | ALL = meses (ou anos, se passar de 24 meses de histórico).
function buildBuckets(range, now, firstDate) {
  const today = startOfClinicDay(now);
  const buckets = [];
  const push = (b) => buckets.push({ revenue: 0, sessions: 0, ...b });

  if (range === "1D") {
    for (let h = 0; h < 24; h++) {
      const start = addHours(today, h);
      push({ key: `h${pad2(h)}`, label: `${pad2(h)}h`, tooltip: `Hoje às ${pad2(h)}h`, start, end: addHours(start, 1) });
    }
    return { granularity: "hour", buckets };
  }

  if (range === "1W" || range === "1M") {
    const n = range === "1W" ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const start = addDays(today, -i);
      const c = clinicParts(start);
      push({
        key: `d${c.getUTCFullYear()}-${pad2(c.getUTCMonth() + 1)}-${pad2(c.getUTCDate())}`,
        label: range === "1W" ? WEEKDAY_LABELS[c.getUTCDay()] : String(c.getUTCDate()),
        tooltip: `${WEEKDAY_LABELS[c.getUTCDay()]}, ${fmtDayMonth(start)}`,
        start,
        end: addDays(start, 1),
      });
    }
    return { granularity: "day", buckets };
  }

  if (range === "3M") {
    const thisWeek = startOfClinicWeek(now);
    for (let i = 12; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      const end = addDays(start, 7);
      push({
        key: `w${fmtDayMonth(start)}`,
        label: fmtDayMonth(start),
        tooltip: `Semana de ${fmtDayMonth(start)} a ${fmtDayMonth(addDays(end, -1))}`,
        start,
        end,
      });
    }
    return { granularity: "week", buckets };
  }

  // meses (1Y e ALL)
  const cur = clinicParts(now);
  let first = { y: cur.getUTCFullYear(), m0: cur.getUTCMonth() - 11 }; // 1Y: 12 meses terminando no atual
  if (range === "ALL") {
    const f = clinicParts(firstDate ?? now);
    first = { y: f.getUTCFullYear(), m0: f.getUTCMonth() };
  }
  const monthsCount = (cur.getUTCFullYear() - first.y) * 12 + (cur.getUTCMonth() - first.m0) + 1;

  if (range === "ALL" && monthsCount > 24) {
    for (let y = first.y; y <= cur.getUTCFullYear(); y++) {
      push({ key: `y${y}`, label: String(y), tooltip: String(y), start: clinicYearStartUtc(y), end: clinicYearStartUtc(y + 1) });
    }
    return { granularity: "year", buckets };
  }

  for (let i = 0; i < monthsCount; i++) {
    const start = clinicMonthStartUtc(first.y, first.m0 + i);
    const c = clinicParts(start);
    push({
      key: `m${c.getUTCFullYear()}-${pad2(c.getUTCMonth() + 1)}`,
      label: MONTH_LABELS[c.getUTCMonth()],
      tooltip: `${MONTH_LABELS[c.getUTCMonth()]}/${String(c.getUTCFullYear()).slice(2)}`,
      start,
      end: clinicMonthStartUtc(first.y, first.m0 + i + 1),
    });
  }
  return { granularity: "month", buckets };
}

export function saleValue(appointment) {
  const price = appointment.service?.price ?? 0;
  const discount = (appointment.couponRedemptions ?? []).reduce((s, r) => s + (r.usedAt ? r.discountAmount ?? 0 : 0), 0);
  return Math.max(price - discount, 0);
}

// Exportado: a página de Receita (todos os cargos de staff) reaproveita o mesmo gráfico
// em outra rota (revenue.js), sem abrir o resto do Overview para quem não é Admin.
export async function chartHandler(req, res) {
  try {
    const range = String(req.query.range || "1M").toUpperCase();
    if (!CHART_RANGES.includes(range)) {
      return res.status(400).json({ error: `Período inválido. Use: ${CHART_RANGES.join(", ")}.` });
    }

    // escopo por profissional: Admin vê a clínica toda; as demais só o que é delas
    // (este handler também serve a página de Receita, aberta a todos os cargos)
    const actor = await getStaffActor(req.user.id);
    if (!actor) return res.status(403).json({ error: "Acesso negado." });
    const scope = scopeWhere(actor);

    const now = new Date();

    // ALL começa no primeiro atendimento concluído
    let firstDate = null;
    if (range === "ALL") {
      const first = await prisma.appointment.findMany({
        where: { ...scope, status: "Completed" },
        orderBy: { date: "asc" },
        take: 1,
        select: { date: true },
      });
      firstDate = first[0]?.date ?? null;
    }

    let { granularity, buckets } = buildBuckets(range, now, firstDate);
    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;

    const appointments = await prisma.appointment.findMany({
      where: { ...scope, status: "Completed", date: { gte: rangeStart, lt: rangeEnd } },
      select: {
        date: true,
        service: { select: { price: true } },
        couponRedemptions: { select: { usedAt: true, discountAmount: true } },
      },
    });

    for (const a of appointments) {
      const t = new Date(a.date).getTime();
      const bucket = buckets.find((b) => t >= b.start.getTime() && t < b.end.getTime());
      if (!bucket) continue;
      bucket.revenue += saleValue(a);
      bucket.sessions += 1;
    }

    // 1D: expediente 08h-19h; só estica se houver atendimento fora dele
    if (granularity === "hour") {
      const used = buckets.map((b, i) => (b.sessions > 0 ? i : null)).filter((i) => i !== null);
      const from = Math.min(8, ...used);
      const to = Math.max(19, ...used);
      buckets = buckets.slice(from, to + 1);
    }

    res.json({
      range,
      granularity,
      totals: {
        revenue: round2(buckets.reduce((s, b) => s + b.revenue, 0)),
        sessions: buckets.reduce((s, b) => s + b.sessions, 0),
      },
      series: buckets.map((b) => ({
        key: b.key,
        label: b.label,
        tooltip: b.tooltip,
        revenue: round2(b.revenue),
        sessions: b.sessions,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o gráfico." });
  }
}

router.get('/admin/overview/chart', ...stockAuth, requirePermission('overview.view'), chartHandler);

//------------------------------------------------------------- CUPONS
// Uso = resgate com `usedAt` preenchido (o cupom foi aplicado num agendamento).
// sort: uses = mais usados | discount = maior desconto total | average = maior desconto médio
const COUPON_SORTS = {
  uses: (a, b) => b.uses - a.uses || b.discountTotal - a.discountTotal,
  discount: (a, b) => b.discountTotal - a.discountTotal || b.uses - a.uses,
  average: (a, b) => b.averageDiscount - a.averageDiscount || b.uses - a.uses,
};

router.get('/admin/overview/coupons', ...stockAuth, requirePermission('overview.view'), async (req, res) => {
  try {
    const period = String(req.query.period || "1M").toUpperCase();
    const sort = String(req.query.sort || "uses");
    if (!(period in CARD_PERIODS)) return res.status(400).json({ error: "Período inválido." });
    if (!(sort in COUPON_SORTS)) return res.status(400).json({ error: "Ordenação inválida." });

    const start = periodStart(period, new Date());
    const redemptions = await prisma.couponRedemption.findMany({
      where: start ? { usedAt: { gte: start } } : undefined,
      include: { coupon: true },
    });

    const byCoupon = new Map();
    for (const r of redemptions) {
      if (!r.usedAt || !r.coupon) continue; // só o que foi de fato usado
      const row = byCoupon.get(r.couponId) ?? {
        couponId: r.couponId,
        code: r.coupon.code,
        discountType: r.coupon.discountType,
        discountValue: r.coupon.discountValue,
        archived: Boolean(r.coupon.archivedAt),
        uses: 0,
        discountTotal: 0,
        lastUsedAt: null,
      };
      row.uses += 1;
      row.discountTotal += r.discountAmount ?? 0;
      if (!row.lastUsedAt || new Date(r.usedAt) > new Date(row.lastUsedAt)) row.lastUsedAt = r.usedAt;
      byCoupon.set(r.couponId, row);
    }

    const items = [...byCoupon.values()]
      .map((c) => ({ ...c, discountTotal: round2(c.discountTotal), averageDiscount: round2(c.discountTotal / c.uses) }))
      .sort(COUPON_SORTS[sort]);

    res.json({
      period,
      sort,
      totals: {
        uses: items.reduce((s, c) => s + c.uses, 0),
        discountTotal: round2(items.reduce((s, c) => s + c.discountTotal, 0)),
        coupons: items.length,
      },
      items: items.slice(0, 8),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o resumo de cupons." });
  }
});

//------------------------------------------------------------- CLIENTES QUE MAIS AGENDARAM
// Sessões no período (data do agendamento, até agora), exceto canceladas.
// sort: sessions = mais sessões | spent = maior gasto (só atendimentos concluídos)
const CUSTOMER_SORTS = {
  sessions: (a, b) => b.sessions - a.sessions || b.spent - a.spent,
  spent: (a, b) => b.spent - a.spent || b.sessions - a.sessions,
};

router.get('/admin/overview/top-customers', ...stockAuth, requirePermission('overview.view'), async (req, res) => {
  try {
    const period = String(req.query.period || "1M").toUpperCase();
    const sort = String(req.query.sort || "sessions");
    if (!(period in CARD_PERIODS)) return res.status(400).json({ error: "Período inválido." });
    if (!(sort in CUSTOMER_SORTS)) return res.status(400).json({ error: "Ordenação inválida." });

    const now = new Date();
    const start = periodStart(period, now);
    const appointments = await prisma.appointment.findMany({
      where: { date: start ? { gte: start, lte: now } : { lte: now } },
      select: {
        date: true,
        status: true,
        customerId: true,
        service: { select: { price: true } },
        couponRedemptions: { select: { usedAt: true, discountAmount: true } },
      },
    });

    const byCustomer = new Map();
    for (const a of appointments) {
      if (!a.customerId || a.status === "Cancelled") continue;
      const row = byCustomer.get(a.customerId) ?? { userId: a.customerId, sessions: 0, completed: 0, spent: 0, lastSessionAt: null };
      row.sessions += 1;
      if (a.status === "Completed") {
        row.completed += 1;
        row.spent += saleValue(a);
      }
      if (!row.lastSessionAt || new Date(a.date) > new Date(row.lastSessionAt)) row.lastSessionAt = a.date;
      byCustomer.set(a.customerId, row);
    }

    const top = [...byCustomer.values()]
      .map((c) => ({ ...c, spent: round2(c.spent) }))
      .sort(CUSTOMER_SORTS[sort])
      .slice(0, 5);

    const users = top.length
      ? await prisma.user.findMany({ where: { id: { in: top.map((c) => c.userId) } }, select: { id: true, name: true, email: true } })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    res.json({
      period,
      sort,
      totalCustomers: byCustomer.size,
      items: top.map((c, i) => ({
        rank: i + 1,
        ...c,
        name: userById.get(c.userId)?.name ?? "Cliente removido",
        email: userById.get(c.userId)?.email ?? null,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o ranking de clientes." });
  }
});

export default router;
