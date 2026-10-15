// Validação de CPF (dígitos verificadores). Usada no cadastro (público e via
// equipe) e em qualquer edição que troque o CPF - recebe o valor já só com
// dígitos (sem pontuação).
export function isValidCpf(cpf) {
  if (!cpf || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let check1 = 11 - (sum % 11);
  if (check1 >= 10) check1 = 0;
  if (check1 !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let check2 = 11 - (sum % 11);
  if (check2 >= 10) check2 = 0;
  if (check2 !== parseInt(cpf[10], 10)) return false;

  return true;
}

// Idade mínima para informar data de nascimento e agendar sessões.
// (Mantenha igual ao MIN_AGE do Account.jsx no front.)
export const MIN_AGE = 13;

// Idade completa em anos na data de hoje. A data de nascimento é guardada à
// meia-noite UTC, então comparamos ano/mês/dia em UTC (sem fuso local).
export function calculateAge(birthdate, now = new Date()) {
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return null;

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export function isUnderMinAge(birthdate, minAge = MIN_AGE) {
  const age = calculateAge(birthdate);
  return age !== null && age < minAge;
}

export const MIN_AGE_MESSAGE = `É necessário ter pelo menos ${MIN_AGE} anos para informar a data de nascimento e agendar sessões.`;

// Mensagem de erro padrão pra conflito de unicidade (e-mail ou CPF
// duplicado), usada em qualquer rota que crie/edite um User.
export function duplicateFieldMessage(error) {
  const target = error.meta?.target;
  const isCpf = Array.isArray(target) ? target.includes("cpf") : String(target || "").includes("cpf");
  return isCpf ? "Este CPF já está cadastrado." : "Este e-mail já está cadastrado.";
}
