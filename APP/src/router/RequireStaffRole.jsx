import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Usar DENTRO de <RequireRole role="staff" /> (staffRoutes.jsx) - esse
// componente não valida se é staff, só filtra por cargo (staff.role).
// Quem não tem o cargo permitido é mandado de volta pra home do
// dashboard, sem quebrar a navegação.
//
// Uso:
// <Route element={<RequireStaffRole allow={["MajorAdmin"]} />}>
//   <Route path="services" element={<Services />} />
// </Route>
export default function RequireStaffRole({ allow = [] }) {
  const { user } = useAuth();

  if (!allow.includes(user?.role)) {
    return <Navigate to="/staff/dashboard" replace />;
  }

  return <Outlet />;
}
