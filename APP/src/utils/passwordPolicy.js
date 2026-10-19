// Política de senha forte. Espelha API/src/lib/passwordPolicy.js: aqui serve para mostrar o
// checklist ao digitar; a validação que vale é a do servidor.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

const strip = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// trechos do nome / e-mail (3+ letras) que a senha não pode conter
function personalTokens({ name, email } = {}) {
  const parts = [...strip(name).split(/\s+/), ...strip(email).split("@")[0].split(/[^a-z0-9]+/)];
  return [...new Set(parts.filter((p) => p.length >= 3))];
}

export const PASSWORD_RULES = [
  { id: "length", label: `Pelo menos ${PASSWORD_MIN} caracteres`, test: (pw) => pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX },
  { id: "case", label: "Letras maiúsculas e minúsculas", test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: "number", label: "Pelo menos um número", test: (pw) => /\d/.test(pw) },
  { id: "symbol", label: "Pelo menos um símbolo (ex: ! @ # $)", test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
  { id: "spaces", label: "Sem espaços", test: (pw) => !/\s/.test(pw) },
  {
    id: "personal",
    label: "Não pode conter seu nome ou e-mail",
    test: (pw, ctx) => !personalTokens(ctx).some((t) => strip(pw).includes(t)),
  },
];

// results: [{ ...regra, ok }]; level: "weak" | "medium" | "strong"
export function evaluatePassword(password, context = {}) {
  const pw = String(password ?? "");
  const results = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(pw, context) }));
  const okCount = results.filter((r) => r.ok).length;
  const passed = okCount === results.length;
  const ratio = okCount / results.length;
  const level = passed ? "strong" : ratio >= 0.67 ? "medium" : "weak";
  return { results, passed, ratio, level };
}
