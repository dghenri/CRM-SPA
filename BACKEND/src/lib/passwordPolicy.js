// Política de senha forte. O front (APP/src/utils/passwordPolicy.js) espelha estas regras
// só para mostrar o checklist ao digitar; quem vale de verdade é a validação daqui.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // limite do bcrypt: acima disso o hash ignora o resto

// partes do nome / e-mail que a senha não pode conter (trechos com 3+ letras)
function personalTokens({ name, email } = {}) {
  const parts = [
    ...String(name ?? '').toLowerCase().split(/\s+/),
    ...String(email ?? '').toLowerCase().split('@')[0].split(/[^a-z0-9]+/),
  ];
  return [...new Set(parts.map((p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '')).filter((p) => p.length >= 3))];
}

// devolve a lista de regras NÃO atendidas (vazia = senha aprovada)
export function validatePassword(password, context = {}) {
  const pw = String(password ?? '');
  const problems = [];

  if (pw.length < PASSWORD_MIN) problems.push(`A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`);
  if (pw.length > PASSWORD_MAX) problems.push(`A senha deve ter no máximo ${PASSWORD_MAX} caracteres.`);
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) problems.push('A senha deve ter letras maiúsculas e minúsculas.');
  if (!/\d/.test(pw)) problems.push('A senha deve ter pelo menos um número.');
  if (!/[^A-Za-z0-9\s]/.test(pw)) problems.push('A senha deve ter pelo menos um símbolo.');
  if (/\s/.test(pw)) problems.push('A senha não pode ter espaços.');

  const plain = pw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (personalTokens(context).some((t) => plain.includes(t))) {
    problems.push('A senha não pode conter seu nome ou e-mail.');
  }
  return problems;
}
