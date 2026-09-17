// Decodifica o payload de um JWT (sem verificar assinatura - isso é
// só pra leitura no front, ex: saber o "type" pra liberar/bloquear rotas.
// A verificação de verdade sempre acontece no backend).
export function decodeToken(token) {
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );

    return JSON.parse(json); // { id, email, type, iat, exp }
  } catch {
    return null;
  }
}

// true se o token existe, é decodificável e não está expirado
export function isTokenValid(token) {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 > Date.now();
}
