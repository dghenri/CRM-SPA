// Idade completa em anos hoje (espelha a regra da API, lib/serviceAge.js).
// A data de nascimento é salva como meia-noite UTC do dia escolhido: lê as partes
// em UTC pra não "voltar um dia" em fusos atrás de Greenwich (ex.: Bahia, UTC-3).
export function ageFromBirthdate(birthdate, ref = new Date()) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  let age = ref.getFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    ref.getMonth() < b.getUTCMonth() ||
    (ref.getMonth() === b.getUTCMonth() && ref.getDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Mensagem de bloqueio se o cliente é novo demais para o procedimento (senão null).
// Sem idade conhecida não bloqueia: quem decide de verdade é a API.
export function minAgeBlockMessage(service, customerAge) {
  if (!service?.minAge || customerAge == null) return null;
  return customerAge < service.minAge
    ? `Este procedimento é permitido a partir de ${service.minAge} anos.`
    : null;
}
