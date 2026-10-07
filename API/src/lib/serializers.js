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
export function toPublicStaff(staff) {
  if (!staff) return null;
  const { password, ...safeStaff } = staff;
  return { ...safeStaff, settings: { ...DEFAULT_STAFF_SETTINGS, ...(staff.settings || {}) } };
}

// Idem para User (cliente)
export function toPublicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}
