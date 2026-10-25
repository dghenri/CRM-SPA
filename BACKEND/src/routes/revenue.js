import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireStaff } from '../middleware/auth.js';
import { loadStaffActor, scopeWhere } from '../lib/appointmentAccess.js';
import { addDays, startOfClinicDay } from '../lib/clinicTime.js';
import { isPaymentMethod } from '../lib/payments.js';
import { CARD_PERIODS, chartHandler, periodStart, saleValue } from './overviewInsights.js';

const router = Router();

//=============================================================== STAFF: RECEITA (FINANÇAS)
//
// Acesso: qualquer cargo de staff (Admin, Farmaceutica, Massoterapeuta).
// Escopo: Admin vê a receita da clínica toda; as demais só a das sessões
// em que são a profissional responsável (scopeWhere).
//
// Mesmas regras do Overview (overviewInsights.js):
// - Receita REALIZADA = agendamentos "Completed".
// - Bruto = preço do serviço | Descontos = cupons usados | Líquido = bruto - descontos
//   (o líquido é o que de fato entrou: é o mesmo valor que o gráfico do Overview soma).
// - Receita PREVISTA = agendamentos "Scheduled" e "Confirmed" de hoje em diante (valor líquido).
// - Tudo no fuso da clínica (UTC-3). Períodos: 1W, 1M, 3M, 1Y, ALL (mesmos dos cards do Overview).
//
// O gráfico da página é o mesmo do Overview (chartHandler), exposto em GET /staff/revenue/chart.

const round2 = (n) => Math.round(n * 100) / 100;
const PERIODS = Object.keys(CARD_PERIODS);
const NO_METHOD = "None"; // agendamentos antigos / sem forma de pagamento informada

// janela do período: [start, end) e, quando existe, a janela anterior de mesmo tamanho
function resolveWindow(period, now) {
  const start = periodStart(period, now); // null = todo o período
  const end = addDays(startOfClinicDay(now), 1); // fim de hoje
  const days = CARD_PERIODS[period];
  const prevStart = start && days ? addDays(start, -days) : null;
  return { start, end, prevStart };
}

const dateRange = (start, end) => ({ ...(start ? { gte: start } : {}), lt: end });

const SALE_SELECT = {
  date: true,
  paymentMethod: true,
  service: { select: { id: true, title: true, price: true } },
  couponRedemptions: { select: { usedAt: true, discountAmount: true } },
};

// bruto / líquido / desconto de UM agendamento (o líquido usa a regra do Overview)
function amounts(appointment) {
  const gross = appointment.service?.price ?? 0;
  const net = saleValue(appointment);
  return { gross, net, discount: Math.max(gross - net, 0) };
}

function totalsOf(list) {
  const t = { gross: 0, discount: 0, net: 0, sessions: list.length };
  for (const a of list) {
    const v = amounts(a);
    t.gross += v.gross;
    t.discount += v.discount;
    t.net += v.net;
  }
  return { ...t, averageTicket: t.sessions ? t.net / t.sessions : 0 };
}

// variação % sobre o período anterior (null = sem base de comparação)
function pctChange(current, previous) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function parsePeriod(req, res) {
  const period = String(req.query.period || "1M").toUpperCase();
  if (!PERIODS.includes(period)) {
    res.status(400).json({ error: `Período inválido. Use: ${PERIODS.join(", ")}.` });
    return null;
  }
  return period;
}

async function completedIn(scope, start, end, select = SALE_SELECT) {
  return prisma.appointment.findMany({
    where: { ...scope, status: "Completed", date: dateRange(start, end) },
    select,
  });
}

//------------------------------------------------------------- GRÁFICO (mesmo do Overview)
router.get('/staff/revenue/chart', authenticateToken, requireStaff, chartHandler);

//------------------------------------------------------------- RESUMO (cards)
router.get('/staff/revenue/summary', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const period = parsePeriod(req, res);
    if (!period) return;
    const scope = scopeWhere(req.actor);

    const now = new Date();
    const { start, end, prevStart } = resolveWindow(period, now);

    const [current, previous, upcoming] = await Promise.all([
      completedIn(scope, start, end),
      prevStart ? completedIn(scope, prevStart, start) : Promise.resolve(null),
      // previsto: ainda vai acontecer (agendado/confirmado, de hoje em diante)
      prisma.appointment.findMany({
        where: { ...scope, status: { in: ["Scheduled", "Confirmed"] }, date: { gte: startOfClinicDay(now) } },
        select: SALE_SELECT,
      }),
    ]);

    const cur = totalsOf(current);
    const prev = previous ? totalsOf(previous) : null;
    const card = (key) => ({ value: round2(cur[key]), change: prev ? pctChange(cur[key], prev[key]) : null });
    const forecast = totalsOf(upcoming);

    res.json({
      period,
      cards: {
        gross: card("gross"),
        discount: card("discount"),
        net: card("net"),
        sessions: { value: cur.sessions, change: prev ? pctChange(cur.sessions, prev.sessions) : null },
        averageTicket: card("averageTicket"),
      },
      forecast: { value: round2(forecast.net), sessions: forecast.sessions },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o resumo de receita." });
  }
});

//------------------------------------------------------------- FORMAS DE PAGAMENTO
// sort: amount = maior valor líquido | sessions = mais sessões
const METHOD_SORTS = {
  amount: (a, b) => b.net - a.net || b.sessions - a.sessions,
  sessions: (a, b) => b.sessions - a.sessions || b.net - a.net,
};

router.get('/staff/revenue/payment-methods', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const period = parsePeriod(req, res);
    if (!period) return;
    const scope = scopeWhere(req.actor);
    const sort = String(req.query.sort || "amount");
    if (!(sort in METHOD_SORTS)) return res.status(400).json({ error: "Ordenação inválida." });

    const { start, end } = resolveWindow(period, new Date());
    const appointments = await completedIn(scope, start, end);

    const byMethod = new Map();
    for (const a of appointments) {
      const method = a.paymentMethod ?? NO_METHOD;
      const row = byMethod.get(method) ?? { method, sessions: 0, gross: 0, discount: 0, net: 0 };
      const v = amounts(a);
      row.sessions += 1;
      row.gross += v.gross;
      row.discount += v.discount;
      row.net += v.net;
      byMethod.set(method, row);
    }

    const totals = totalsOf(appointments);
    const items = [...byMethod.values()]
      .map((r) => ({
        ...r,
        gross: round2(r.gross),
        discount: round2(r.discount),
        net: round2(r.net),
        averageTicket: round2(r.sessions ? r.net / r.sessions : 0),
        shareAmount: totals.net > 0 ? round2((r.net / totals.net) * 100) : 0,
        shareSessions: totals.sessions > 0 ? round2((r.sessions / totals.sessions) * 100) : 0,
      }))
      .sort(METHOD_SORTS[sort]);

    res.json({
      period,
      sort,
      totals: { net: round2(totals.net), sessions: totals.sessions },
      items,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar o resumo por forma de pagamento." });
  }
});

//------------------------------------------------------------- RECEITA POR PROCEDIMENTO
const SERVICE_SORTS = {
  revenue: (a, b) => b.net - a.net || b.sessions - a.sessions,
  sessions: (a, b) => b.sessions - a.sessions || b.net - a.net,
};

router.get('/staff/revenue/services', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const period = parsePeriod(req, res);
    if (!period) return;
    const scope = scopeWhere(req.actor);
    const sort = String(req.query.sort || "revenue");
    if (!(sort in SERVICE_SORTS)) return res.status(400).json({ error: "Ordenação inválida." });
    // card da página = top 6 (padrão); o relatório em PDF pede todos (até 100)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 6));

    const { start, end } = resolveWindow(period, new Date());
    const appointments = await completedIn(scope, start, end);

    const byService = new Map();
    for (const a of appointments) {
      const id = a.service?.id ?? "none";
      const row = byService.get(id) ?? {
        serviceId: a.service?.id ?? null,
        title: a.service?.title ?? "Sem procedimento",
        sessions: 0,
        gross: 0,
        net: 0,
      };
      const v = amounts(a);
      row.sessions += 1;
      row.gross += v.gross;
      row.net += v.net;
      byService.set(id, row);
    }

    const totals = totalsOf(appointments);
    const all = [...byService.values()].sort(SERVICE_SORTS[sort]);

    res.json({
      period,
      sort,
      totalServices: all.length,
      items: all.slice(0, limit).map((r) => ({
        ...r,
        gross: round2(r.gross),
        net: round2(r.net),
        share: totals.net > 0 ? round2((r.net / totals.net) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao montar a receita por procedimento." });
  }
});

//------------------------------------------------------------- TRANSAÇÕES (atendimentos concluídos)
// Query: period, page (1...), limit (1-50, padrão 10), payment (Pix | CreditCard | DebitCard | Cash)
router.get('/staff/revenue/transactions', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const period = parsePeriod(req, res);
    if (!period) return;
    const scope = scopeWhere(req.actor);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const payment = req.query.payment ? String(req.query.payment) : null;
    if (payment && !isPaymentMethod(payment)) return res.status(400).json({ error: "Forma de pagamento inválida." });

    const { start, end } = resolveWindow(period, new Date());
    const where = {
      ...scope,
      status: "Completed",
      date: dateRange(start, end),
      ...(payment ? { paymentMethod: payment } : {}),
    };

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          code: true,
          title: true,
          date: true,
          paymentMethod: true,
          customer: { select: { name: true, email: true } },
          service: { select: { id: true, title: true, price: true } },
          couponRedemptions: { select: { usedAt: true, discountAmount: true } },
        },
      }),
    ]);

    res.json({
      period,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: appointments.map((a) => {
        const v = amounts(a);
        return {
          id: a.id,
          code: a.code,
          date: a.date,
          customerName: a.customer?.name ?? "Sem cliente",
          customerEmail: a.customer?.email ?? null,
          serviceTitle: a.service?.title ?? a.title,
          paymentMethod: a.paymentMethod ?? null,
          gross: round2(v.gross),
          discount: round2(v.discount),
          net: round2(v.net),
        };
      }),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao listar as transações." });
  }
});

export default router;
