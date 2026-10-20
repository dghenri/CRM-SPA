import { prisma } from './prisma.js';

//=============================================================== EXPEDIENTE DA PROFISSIONAL
// Os horários cadastrados em StaffAvailability ("HH:mm" por dia da semana) são horários
// do relógio da CLÍNICA. O servidor pode estar em outro fuso (ex.: UTC), então os
// agendamentos são convertidos para o fuso da clínica antes de comparar.
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'America/Bahia';

// Enquanto a profissional não cadastrou NENHUM horário, vale o expediente que o
// sistema já usava (08:00-19:00, todos os dias) - assim ninguém fica sem agenda
// só porque ainda não abriu a aba "Disponibilidade".
export const DEFAULT_INTERVALS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startTime: '08:00',
  endTime: '19:00',
}));

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIMEZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// dia da semana, dia do calendário e minutos desde a meia-noite, no relógio da clínica
function clinicParts(date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    weekday: WEEKDAY_INDEX[p.weekday],
    day: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// A sessão [start, end] cabe inteira em UM intervalo de trabalho daquele dia?
export function fitsSchedule(intervals, start, end) {
  const s = clinicParts(start);
  const e = clinicParts(end);
  if (s.day !== e.day) return false; // não atravessa a meia-noite
  return intervals.some(
    (i) => i.weekday === s.weekday && toMinutes(i.startTime) <= s.minutes && e.minutes <= toMinutes(i.endTime)
  );
}

// Situação de agenda de uma profissional para o agendamento online:
// { professionalId, professionalName, available, reason, usesDefault, intervals }
// - Inactive / OnLeave (férias, afastamento): não recebe agendamentos.
// - sem nenhum intervalo cadastrado: usa DEFAULT_INTERVALS (usesDefault = true).
export async function getBookingSchedule(staffId) {
  const staff = staffId
    ? await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, name: true, status: true } })
    : null;

  if (!staff) {
    return { professionalId: null, professionalName: null, available: false, reason: 'NoProfessional', usesDefault: false, intervals: [] };
  }
  if (staff.status !== 'Active') {
    return {
      professionalId: staff.id,
      professionalName: staff.name,
      available: false,
      reason: staff.status, // "OnLeave" | "Inactive"
      usesDefault: false,
      intervals: [],
    };
  }

  const rows = await prisma.staffAvailability.findMany({
    where: { staffId: staff.id },
    select: { weekday: true, startTime: true, endTime: true },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  const usesDefault = rows.length === 0;

  return {
    professionalId: staff.id,
    professionalName: staff.name,
    available: true,
    reason: null,
    usesDefault,
    intervals: usesDefault ? DEFAULT_INTERVALS : rows,
  };
}
