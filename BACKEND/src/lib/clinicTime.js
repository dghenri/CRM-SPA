// Datas no fuso da clínica (America/Bahia = UTC-3, sem horário de verão).
// Truque: somamos o deslocamento e lemos com os getters UTC, assim "dia/mês/hora"
// são os da clínica independentemente do fuso do servidor.
export const CLINIC_TZ_OFFSET_H = -3;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Date "deslocado": use SOMENTE getUTC*() nele
export const clinicParts = (date) => new Date(new Date(date).getTime() + CLINIC_TZ_OFFSET_H * HOUR);

// instante UTC em que começa o dia (00:00 da clínica) de y/m0/d (m0 e d podem estourar)
export const clinicDayStartUtc = (y, m0, d) => new Date(Date.UTC(y, m0, d, -CLINIC_TZ_OFFSET_H));
export const clinicMonthStartUtc = (y, m0) => clinicDayStartUtc(y, m0, 1);
export const clinicYearStartUtc = (y) => clinicDayStartUtc(y, 0, 1);

export function startOfClinicDay(date) {
  const c = clinicParts(date);
  return clinicDayStartUtc(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
}

export const addDays = (utcDate, n) => new Date(utcDate.getTime() + n * DAY);
export const addHours = (utcDate, n) => new Date(utcDate.getTime() + n * HOUR);

// segunda-feira (00:00 da clínica) da semana de `date`
export function startOfClinicWeek(date) {
  const day = startOfClinicDay(date);
  const dow = clinicParts(day).getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}

export const pad2 = (n) => String(n).padStart(2, "0");
export const fmtDayMonth = (utcDate) => {
  const c = clinicParts(utcDate);
  return `${pad2(c.getUTCDate())}/${pad2(c.getUTCMonth() + 1)}`;
};
