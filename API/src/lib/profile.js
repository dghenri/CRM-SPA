// Perfil completo = o cliente informou telefone e data de nascimento.
// Sem isso ele não consegue agendar (POST /appointments responde 403) e
// recebe o aviso principal "Complete seu perfil". Para exigir mais um dado,
// é só incluir aqui (e em getPendingFields no front).
export function getMissingProfileFields(user) {
  const missing = [];
  if (!String(user?.phone ?? "").trim()) missing.push("phone");
  if (!user?.birthdate) missing.push("birthdate");
  return missing;
}

export function isProfileComplete(user) {
  return getMissingProfileFields(user).length === 0;
}

export const PROFILE_FIELD_LABELS = { phone: "telefone", birthdate: "data de nascimento" };
// seção da página Account (?editar=...) que edita cada campo
export const PROFILE_FIELD_SECTIONS = { phone: "telefone", birthdate: "nascimento" };
