import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { addDays, clinicMonthStartUtc, clinicParts, fmtDayMonth, MONTH_LABELS, startOfClinicDay } from '../lib/clinicTime.js';
import { stockAuth } from '../middleware/auth.js';
import { saleValue } from './overviewInsights.js';

const router = Router();

const PERIOD_DAYS = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365 };
const APPOINTMENT_STATUSES = ["Completed", "Cancelled", "NoShow", "Scheduled", "Confirmed"];
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function resolveWindow(period, now) {
  const end = addDays(startOfClinicDay(now), 1);
  if (period === "1Y") {
    const current = clinicParts(now);
    return { start: clinicMonthStartUtc(current.getUTCFullYear(), current.getUTCMonth() - 11), end };
  }
  return { start: addDays(startOfClinicDay(now), -(PERIOD_DAYS[period] - 1)), end };
}

function buildBuckets(period, start, end) {
  const buckets = [];
  let granularity;
  let step;

  if (period === "1W" || period === "1M") {
    granularity = "day";
    step = 24 * 60 * 60 * 1000;
  } else if (period === "3M") {
    granularity = "week";
    step = 7 * 24 * 60 * 60 * 1000;
  } else {
    granularity = "month";
  }

  if (granularity === "month") {
    const current = clinicParts(new Date(end.getTime() - 1));
    for (let offset = -11; offset <= 0; offset++) {
      const bucketStart = clinicMonthStartUtc(current.getUTCFullYear(), current.getUTCMonth() + offset);
      const bucketEnd = clinicMonthStartUtc(current.getUTCFullYear(), current.getUTCMonth() + offset + 1);
      const month = clinicParts(bucketStart);
      buckets.push({
        key: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`,
        label: MONTH_LABELS[month.getUTCMonth()],
        start: bucketStart,
        end: bucketEnd,
        completed: 0,
        cancelled: 0,
        noShow: 0,
      });
    }
  } else {
    for (let bucketStart = start, index = 0; bucketStart < end; bucketStart = new Date(bucketStart.getTime() + step), index += 1) {
      const bucketEnd = new Date(Math.min(bucketStart.getTime() + step, end.getTime()));
      buckets.push({
        key: `${granularity}-${index}`,
        label: fmtDayMonth(bucketStart),
        start: bucketStart,
        end: bucketEnd,
        completed: 0,
        cancelled: 0,
        noShow: 0,
      });
    }
  }

  return buckets;
}

function newTotals() {
  return { completed: 0, cancelled: 0, noShow: 0, revenue: 0, customers: new Set() };
}

function toSummary(totals) {
  const resolved = totals.completed + totals.cancelled + totals.noShow;
  return {
    completed: totals.completed,
    cancelled: totals.cancelled,
    noShow: totals.noShow,
    revenue: round2(totals.revenue),
    averageTicket: round2(totals.completed ? totals.revenue / totals.completed : 0),
    cancellationRate: resolved ? round1(((totals.cancelled + totals.noShow) / resolved) * 100) : 0,
    customers: totals.customers.size,
  };
}

router.get('/staff/performance', ...stockAuth, async (req, res) => {
  try {
    const period = String(req.query.period || "1M").toUpperCase();
    if (!Object.hasOwn(PERIOD_DAYS, period)) {
      return res.status(400).json({ error: `Período inválido. Use: ${Object.keys(PERIOD_DAYS).join(", ")}.` });
    }

    const canCompareTeam = req.staff.role === "Admin" || req.staff.role === "Manager";
    const staffMembers = canCompareTeam
      ? await prisma.staff.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            status: true,
            profession: { select: { name: true } },
          },
        })
      : [{
          id: req.staff.id,
          name: req.staff.name,
          avatarUrl: req.staff.avatarUrl,
          status: req.staff.status,
          profession: null,
        }];

    const staffIds = staffMembers.map((member) => member.id);
    const requestedStaffId = String(req.query.staffId || "");
    if (canCompareTeam && requestedStaffId && requestedStaffId !== "team" && !staffIds.includes(requestedStaffId)) {
      return res.status(400).json({ error: "Funcionário inválido para comparação." });
    }
    const trendStaffId =
      canCompareTeam && requestedStaffId && requestedStaffId !== "team" ? requestedStaffId : null;
    const now = new Date();
    const { start, end } = resolveWindow(period, now);
    const appointments = await prisma.appointment.findMany({
      where: {
        professionalId: { in: staffIds },
        status: { in: APPOINTMENT_STATUSES },
        date: { gte: start, lt: end },
      },
      select: {
        professionalId: true,
        customerId: true,
        date: true,
        status: true,
        service: { select: { price: true } },
        couponRedemptions: { select: { usedAt: true, discountAmount: true } },
      },
    });

    const totalsByStaff = new Map(staffIds.map((id) => [id, newTotals()]));
    const teamTotals = newTotals();
    const buckets = buildBuckets(period, start, end);

    for (const appointment of appointments) {
      const staffTotals = totalsByStaff.get(appointment.professionalId);
      if (!staffTotals) continue;

      if (appointment.status === "Completed") {
        staffTotals.completed += 1;
        teamTotals.completed += 1;
        const amount = saleValue(appointment);
        staffTotals.revenue += amount;
        teamTotals.revenue += amount;
        if (appointment.customerId) {
          staffTotals.customers.add(appointment.customerId);
          teamTotals.customers.add(appointment.customerId);
        }
      } else if (appointment.status === "Cancelled") {
        staffTotals.cancelled += 1;
        teamTotals.cancelled += 1;
      } else if (appointment.status === "NoShow") {
        staffTotals.noShow += 1;
        teamTotals.noShow += 1;
      }

      if (trendStaffId && appointment.professionalId !== trendStaffId) continue;

      const bucket = buckets.find((item) => appointment.date >= item.start && appointment.date < item.end);
      if (bucket) {
        if (appointment.status === "Completed") bucket.completed += 1;
        if (appointment.status === "Cancelled") bucket.cancelled += 1;
        if (appointment.status === "NoShow") bucket.noShow += 1;
      }
    }

    const staff = staffMembers
      .map((member) => ({
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        status: member.status,
        profession: member.profession?.name ?? null,
        ...toSummary(totalsByStaff.get(member.id)),
      }))
      .sort((a, b) => b.completed - a.completed || b.revenue - a.revenue || a.name.localeCompare(b.name, "pt-BR"));

    res.json({
      period,
      generatedAt: now,
      canCompareTeam,
      trendStaffId,
      summary: toSummary(teamTotals),
      staff,
      series: buckets.map(({ key, label, completed, cancelled, noShow }) => ({
        key,
        label,
        completed,
        cancelled,
        noShow,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao carregar a progressão dos funcionários." });
  }
});

export default router;
