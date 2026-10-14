import { prisma } from '../lib/prisma.js';
import { DEFAULT_USER_NOTIFICATIONS } from '../lib/serializers.js';
import { PROFILE_FIELD_LABELS, PROFILE_FIELD_SECTIONS, getMissingProfileFields } from '../lib/profile.js';
import { WELCOME_COUPON_CODE } from './welcomeCoupon.js';

export const NOTIFICATION_STATUSES = ["Default", "Accent", "Success", "Warning", "Danger"];
export const NOTIFICATION_CATEGORIES = ["General", "Promotions", "News"];

// Rota interna do app ("/user/..."). Aceitamos só caminhos internos pra equipe
// não conseguir (nem por engano) mandar o cliente para um site externo.
export function isInternalPath(path) {
  return typeof path === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(path);
}

//------------------------------------------------------------- NOTIFICAÇÕES GUARDADAS (eventos e disparos)
export async function notifyUser(userId, { status = "Default", title, description, actionLabel, actionPath, kind }) {
  if (!userId) return null;
  try {
    return await prisma.notification.create({
      data: {
        userId, status, title,
        description: description || undefined,
        actionLabel: actionLabel || undefined,
        actionPath: actionPath || undefined,
        kind: kind || undefined,
      },
    });
  } catch (error) {
    // a notificação nunca pode derrubar a ação principal (ex: agendar)
    console.error("Falha ao criar notificação:", error);
    return null;
  }
}

function formatWhen(date) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia",
  });
}

// Notificações automáticas de agendamento. `appointment` precisa de customerId.
const STATUS_NOTICES = {
  Confirmed: { status: "Success", title: "Sessão confirmada" },
  Cancelled: { status: "Danger", title: "Sessão cancelada" },
  Completed: { status: "Accent", title: "Atendimento concluído" },
  NoShow: { status: "Warning", title: "Sessão não realizada" },
};

export function notifyAppointmentCreated(appointment) {
  if (!appointment?.customerId) return null;
  return notifyUser(appointment.customerId, {
    status: "Success",
    title: "Sessão agendada",
    description: `${appointment.title} · ${formatWhen(appointment.date)}. A equipe pode revisar o agendamento.`,
    actionLabel: "Ver sessão",
    actionPath: "/user/scheduling",
    kind: "appointment-created",
  });
}

export function notifyAppointmentStatus(appointment, previousStatus) {
  if (!appointment?.customerId || appointment.status === previousStatus) return null;
  const notice = STATUS_NOTICES[appointment.status];
  if (!notice) return null; // "Scheduled" não gera aviso
  return notifyUser(appointment.customerId, {
    ...notice,
    description: `${appointment.title} · ${formatWhen(appointment.date)}`,
    actionLabel: "Ver sessão",
    actionPath: "/user/scheduling",
    kind: `appointment-${appointment.status.toLowerCase()}`,
  });
}

//------------------------------------------------------------- ALERTAS DE ESTADO (calculados na hora)
// Estes NÃO ficam no banco: são recalculados a cada leitura a partir do estado
// real do cliente. Por isso somem sozinhos assim que a condição acaba (perfil
// completado, cupom usado, sessão agendada) - sem rotina de limpeza e sem
// risco de ficar um aviso velho na tela.
// `dismissible: false` = aviso obrigatório, sem botão de fechar.
export async function buildSystemAlerts(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  const alerts = [];

  // 1) perfil incompleto - o aviso principal (bloqueia o agendamento)
  const missing = getMissingProfileFields(user);
  if (missing.length > 0) {
    const labels = missing.map((f) => PROFILE_FIELD_LABELS[f]).join(" e ");
    alerts.push({
      key: "profile-incomplete",
      status: "Warning",
      title: "Complete seu perfil",
      description: `Informe seu ${labels} para liberar o agendamento de sessões.`,
      actionLabel: "Completar perfil",
      actionPath: `/user/account?editar=${PROFILE_FIELD_SECTIONS[missing[0]]}`,
      dismissible: false,
      priority: 0,
    });
  }

  // 2) cupom de boas-vindas na carteira e ainda não usado
  const welcome = await prisma.coupon.findUnique({ where: { code: WELCOME_COUPON_CODE } });
  if (welcome && !welcome.archivedAt && !(welcome.expiresAt && new Date(welcome.expiresAt) <= new Date())) {
    const mine = await prisma.couponRedemption.findMany({ where: { userId, couponId: welcome.id } });
    const hasUnused = mine.some((r) => !r.usedAt);
    if (hasUnused) {
      alerts.push({
        key: "welcome-coupon",
        status: "Accent",
        title: `Você ganhou ${welcome.discountValue}% de desconto`,
        description: `Use o cupom ${WELCOME_COUPON_CODE} na sua primeira sessão.`,
        actionLabel: "Ver cupom",
        actionPath: "/user/coupons",
        dismissible: true,
        priority: 1,
      });
    }
  }

  // 3) primeira sessão: perfil completo e nenhum agendamento ativo/concluído ainda
  if (missing.length === 0) {
    const mine = await prisma.appointment.findMany({ where: { customerId: userId } });
    if (!mine.some((a) => a.status !== "Cancelled")) {
      alerts.push({
        key: "first-appointment",
        status: "Default",
        title: "Agende sua primeira sessão",
        description: "Escolha o procedimento, a data e o horário que melhor combinam com você.",
        actionLabel: "Agendar",
        actionPath: "/user/services",
        dismissible: true,
        priority: 2,
      });
    }
  }

  const dismissed = new Set(user.dismissedAlertKeys ?? []);
  return alerts
    .filter((a) => !a.dismissible || !dismissed.has(a.key))
    .sort((a, b) => a.priority - b.priority);
}

// A equipe pode silenciar categorias nas preferências do cliente
export function acceptsCategory(user, category) {
  const prefs = { ...DEFAULT_USER_NOTIFICATIONS, ...(user.notificationPrefs || {}) };
  if (category === "Promotions") return prefs.promotions !== false;
  if (category === "News") return prefs.news !== false;
  return true;
}
