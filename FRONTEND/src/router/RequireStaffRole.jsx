import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Usar DENTRO de <RequireRole role="staff" /> (staffRoutes.jsx) - esse
// componente não valida se é staff, só filtra por cargo (staff.role) e/ou
// por permissão (staff.effectivePermissions). Quem não passa é mandado de
// volta pra home do dashboard, sem quebrar a navegação.
//
// Se vierem os dois, a pessoa precisa passar nos dois. Sem nenhum dos dois, ninguém entra.
//
// Uso:
// <Route element={<RequireStaffRole allow={["Admin"]} />}>            // só esse(s) cargo(s)
// <Route element={<RequireStaffRole permission="overview.view" />}>   // quem tem a permissão (Admin sempre tem)
export default function RequireStaffRole({ allow, permission }) {
  const { user, can } = useAuth();

  const hasRule = Boolean(allow) || Boolean(permission);
  const roleOk = !allow || allow.includes(user?.role);
  const permissionOk = !permission || can(permission);

  if (!hasRule || !roleOk || !permissionOk) {
    return <Navigate to="/staff" replace />;
  }

  return <Outlet />;
}
