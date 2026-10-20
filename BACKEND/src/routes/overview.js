import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireMajorAdmin, stockAuth } from '../middleware/auth.js';

const router = Router();

//=============================================================== ADMIN: OVERVIEW (DASHBOARD)
//
// Regras de cálculo (todas sobre agendamentos com status "Completed"):
// - Faturamento = preço do serviço - desconto de cupom usado no agendamento.
//   (o Service não guarda o preço "congelado" no agendamento; se o preço do
//   serviço mudar, meses passados refletem o preço atual.)
// - Sessões = quantidade de agendamentos concluídos no mês.
// - Cancelamento = (Cancelled + NoShow) / (Completed + Cancelled + NoShow);
//   agendamentos ainda Scheduled/Confirmed não entram (o desfecho é desconhecido).
// - Recorrentes = % dos clientes atendidos no mês que já tinham sessão
//   concluída ANTES do mês.
// - Mês fechado no fuso America/Bahia (UTC-3, sem horário de verão).

const OVERVIEW_TZ_OFFSET_H = -3;
const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// início do mês (00:00 no fuso da clínica) como Date UTC. month0 pode estourar (-1 = dez do ano anterior)
const monthStartUtc = (year, month0) => new Date(Date.UTC(year, month0, 1, -OVERVIEW_TZ_OFFSET_H));

// { y, m0 } do mês em que `date` cai, no fuso da clínica
function clinicYearMonth(date) {
  const d = new Date(new Date(date).getTime() + OVERVIEW_TZ_OFFSET_H * 3600 * 1000);
  return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// variação percentual; sem base de comparação (mês anterior = 0) devolve null
const pctChange = (cur, prev) => (prev > 0 ? round1(((cur - prev) / prev) * 100) : null);

router.get('/admin/overview', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 2), 24);
    const now = new Date();
    const { y: curY, m0: curM0 } = clinicYearMonth(now);

    // buckets do mais antigo para o atual
    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = monthStartUtc(curY, curM0 - i);
      const { y, m0 } = clinicYearMonth(start);
      buckets.push({
        key: `${y}-${String(m0 + 1).padStart(2, "0")}`,
        label: MONTH_LABELS[m0],
        year: y,
        start,
        end: monthStartUtc(y, m0 + 1),
        revenue: 0,
        sessions: 0,
        cancelled: 0,
        customers: new Set(),
        newCustomers: 0,
      });
    }
    const bucketOf = (date) => {
      const { y, m0 } = clinicYearMonth(date);
      const key = `${y}-${String(m0 + 1).padStart(2, "0")}`;
      return buckets.find((b) => b.key === key);
    };

    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;

    const [appointments, newUsers] = await Promise.all([
      prisma.appointment.findMany({
        where: { date: { gte: rangeStart, lt: rangeEnd } },
        select: {
          date: true,
          status: true,
          customerId: true,
          service: { select: { price: true } },
          couponRedemptions: { select: { usedAt: true, discountAmount: true } },
        },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { createdAt: true },
      }),
    ]);

    for (const a of appointments) {
      const b = bucketOf(a.date);
      if (!b) continue;
      if (a.status === "Completed") {
        const price = a.service?.price ?? 0;
        const discount = a.couponRedemptions.reduce((s, r) => s + (r.usedAt ? r.discountAmount ?? 0 : 0), 0);
        b.revenue += Math.max(price - discount, 0);
        b.sessions += 1;
        if (a.customerId) b.customers.add(a.customerId);
      } else if (a.status === "Cancelled" || a.status === "NoShow") {
        b.cancelled += 1;
      }
    }
    for (const u of newUsers) {
      const b = bucketOf(u.createdAt);
      if (b) b.newCustomers += 1;
    }

    // recorrentes: dos clientes atendidos no mês, quantos já tinham sessão concluída antes dele
    async function returningRate(bucket) {
      const ids = [...bucket.customers];
      if (ids.length === 0) return null;
      const earlier = await prisma.appointment.findMany({
        where: { status: "Completed", customerId: { in: ids }, date: { lt: bucket.start } },
        select: { customerId: true },
      });
      const returning = new Set(earlier.map((e) => e.customerId));
      return round1((returning.size / ids.length) * 100);
    }

    const cur = buckets[buckets.length - 1];
    const prev = buckets[buckets.length - 2];
    const [curReturning, prevReturning] = await Promise.all([returningRate(cur), returningRate(prev)]);

    const ticket = (b) => (b.sessions > 0 ? b.revenue / b.sessions : 0);
    const cancelRate = (b) => {
      const resolved = b.sessions + b.cancelled;
      return resolved > 0 ? round1((b.cancelled / resolved) * 100) : 0;
    };
    // diferença em pontos percentuais (para métricas que já são %)
    const pp = (c, p) => (c == null || p == null ? null : round1(c - p));

    res.json({
      generatedAt: now,
      month: { key: cur.key, label: MONTH_LABELS[curM0], year: curY },
      cards: {
        revenue: { value: round2(cur.revenue), previous: round2(prev.revenue), change: pctChange(cur.revenue, prev.revenue), unit: "pct" },
        sessions: { value: cur.sessions, previous: prev.sessions, change: pctChange(cur.sessions, prev.sessions), unit: "pct" },
        averageTicket: { value: round2(ticket(cur)), previous: round2(ticket(prev)), change: pctChange(ticket(cur), ticket(prev)), unit: "pct" },
        newCustomers: { value: cur.newCustomers, previous: prev.newCustomers, change: pctChange(cur.newCustomers, prev.newCustomers), unit: "pct" },
        returningCustomers: { value: curReturning, previous: prevReturning, change: pp(curReturning, prevReturning), unit: "pp" },
        cancellationRate: { value: cancelRate(cur), previous: cancelRate(prev), change: pp(cancelRate(cur), cancelRate(prev)), unit: "pp" },
      },
      series: buckets.map((b) => ({
        key: b.key,
        label: b.label,
        year: b.year,
        revenue: round2(b.revenue),
        sessions: b.sessions,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o dashboard." });
  }
});

export default router;
