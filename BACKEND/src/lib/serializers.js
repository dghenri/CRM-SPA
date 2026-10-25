import { getEffectivePermissions } from './permissions.js';

// Valores padrão pra `Staff.settings` quando o campo ainda não foi
// definido (ex: contas criadas antes dessa configuração existir).
// Qualquer preferência nova (ex: notificações, densidade da agenda) entra
// aqui, sem precisar de migration no schema.
export const DEFAULT_STAFF_SETTINGS = {
  dragAppointments: false,
  theme: "system",
  showClockSeconds: true,
};

// Campos da equipe (Staff) que podem ir para o front (nunca inclua "password" aqui)
// - `permissions`: lista personalizada (só vale se customPermissions = true)
// - `effectivePermissions`: o que a pessoa realmente pode (cargo + personalização); o front usa pra mostrar/esconder telas
export function toPublicStaff(staff) {
  if (!staff) return null;
  const { password, ...safeStaff } = staff;
  return {
    ...safeStaff,
    customPermissions: staff.customPermissions === true,
    permissions: staff.permissions || [],
    effectivePermissions: getEffectivePermissions(staff),
    settings: { ...DEFAULT_STAFF_SETTINGS, ...(staff.settings || {}) },
  };
}

// Preferências de notificação do cliente quando ainda não escolheu nada.
// Preferência nova = só entrar aqui (o campo no banco é Json).
export const DEFAULT_USER_NOTIFICATIONS = {
  sessionReminders: true, // lembretes de sessão agendada
  promotions: true, //       promoções e cupons
  news: false, //            novidades do SPA
  viaEmail: true,
  viaWhatsapp: true,
};

// Idem para User (cliente).
// `avatarUrl` (caminho da foto, ex: /uploads/avatars/x.jpg) só vai quando pedido (includeAvatar):
// listas da equipe e agendamentos não precisam da foto de todo mundo.
export function toPublicUser(user, { includeAvatar = false } = {}) {
  if (!user) return null;
  const { password, avatarUrl, notificationPrefs, ...safeUser } = user;
  return {
    ...safeUser,
    ...(includeAvatar ? { avatarUrl: avatarUrl ?? null } : {}),
    notificationPrefs: { ...DEFAULT_USER_NOTIFICATIONS, ...(notificationPrefs || {}) },
  };
}
