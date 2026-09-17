import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { decodeToken, isTokenValid } from "../utils/jwt";

// Guard de rota: só renderiza as rotas filhas (<Outlet />) se o token
// existir, for válido e tiver o "type" esperado ("staff" ou "user").
//
// IMPORTANTE: como isso decide se a página inteira é montada ou não,
// nenhum componente/rota protegida chega a renderizar (nem disparar
// fetch, nem mostrar UI) pra quem não tem a role certa - o redirect
// acontece antes disso.
export default function RequireRole({ role }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  // Enquanto o AuthContext ainda está confirmando a sessão (ex: no
  // primeiro carregamento da página, esperando o /auth/staff/me ou
  // /users/me responder), não decide nada ainda - evita liberar ou
  // bloquear o acesso com base em informação incompleta.
  if (loading) return null;

  const decoded = decodeToken(token);
  const isAuthorized = isTokenValid(token) && decoded?.type === role;

  if (!isAuthorized) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
