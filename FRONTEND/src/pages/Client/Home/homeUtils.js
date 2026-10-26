// Funções puras da Home do cliente (sem React): datas, escolha da próxima sessão, cupom em destaque...

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// diferença em DIAS DE CALENDÁRIO (hoje = 0, amanhã = 1, ontem = -1)
export function calendarDaysFromNow(date, now = new Date()) {
  return Math.round((startOfDay(new Date(date)) - startOfDay(now)) / DAY_MS);
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// "Hoje às 14:00" | "Amanhã às 09:30" | "sex., 30/10 às 11:00"
export function formatSessionWhen(date, now = new Date()) {
  const days = calendarDaysFromNow(date, now);
  const time = formatTime(date);
  if (days === 0) return `Hoje às ${time}`;
  if (days === 1) return `Amanhã às ${time}`;
  const day = new Date(date).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${day} às ${time}`;
}

// "em 2 horas" | "em 35 min" | "em 3 dias" — só pra sessões ainda não iniciadas
export function formatCountdown(date, now = new Date()) {
  const ms = new Date(date).getTime() - now.getTime();
  if (ms <= 0) return "agora";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `em ${minutes} min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `em ${hours} h`;
  const days = calendarDaysFromNow(date, now);
  return `em ${days} ${days === 1 ? "dia" : "dias"}`;
}

// "há 3 dias" | "há 1 mês" | "ontem" | "hoje"
export function formatTimeAgo(date, now = new Date()) {
  const days = -calendarDaysFromNow(date, now);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

// próxima sessão: Agendada/Confirmada que ainda não terminou, a mais próxima
export function pickNextAppointment(appointments, now = new Date()) {
  return (
    (appointments ?? [])
      .filter((a) => (a.status === "Scheduled" || a.status === "Confirmed") && new Date(a.endDate) > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] ?? null
  );
}

// última sessão concluída cujo procedimento ainda existe e está disponível (pra "Agendar novamente")
export function pickLastCompleted(appointments) {
  return (
    (appointments ?? [])
      .filter((a) => a.status === "Completed" && a.serviceId && a.service?.available)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] ?? null
  );
}

// mesmas regras da tela de Cupons: ativo (ou agendado) e ainda com usos sobrando
export function availableCoupons(coupons) {
  return (coupons ?? []).filter(
    (c) =>
      (c.status === "active" || c.status === "scheduled") &&
      (!c.usageLimit || c.usageCount < c.usageLimit) &&
      (!c.perUserLimit || c.myUsageCount < c.perUserLimit)
  );
}

// cupom em destaque: só os que já valem, o que vence primeiro (sem validade vai por último)
export function pickFeaturedCoupon(coupons) {
  return (
    availableCoupons(coupons)
      .filter((c) => c.status === "active")
      .sort((a, b) => {
        const ea = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
        const eb = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
        return ea - eb;
      })[0] ?? null
  );
}

export function formatPrice(value) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}
