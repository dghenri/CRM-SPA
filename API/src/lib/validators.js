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

// Mensagem de erro padrão pra conflito de unicidade (e-mail ou CPF
// duplicado), usada em qualquer rota que crie/edite um User.
export function duplicateFieldMessage(error) {
  const target = error.meta?.target;
  const isCpf = Array.isArray(target) ? target.includes("cpf") : String(target || "").includes("cpf");
  return isCpf ? "Este CPF já está cadastrado." : "Este e-mail já está cadastrado.";
}
