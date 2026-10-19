// Mensagens e regras de validação dos formulários de autenticação
export const EMAIL_REQUIRED_MESSAGE = "Digite seu e-mail.";
export const EMAIL_INVALID_MESSAGE = "Digite um e-mail válido.";
export const PASSWORD_REQUIRED_MESSAGE = "Digite sua senha.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value) => EMAIL_RE.test(String(value ?? "").trim());

// devolve a mensagem de erro do e-mail, ou "" quando está tudo certo
export function validateEmail(value) {
  const email = String(value ?? "").trim();
  if (!email) return EMAIL_REQUIRED_MESSAGE;
  return isValidEmail(email) ? "" : EMAIL_INVALID_MESSAGE;
}
