import { Route } from "react-router-dom";

import RequireRole from "../components/RequireRole";
import RequireStaffRole from "./RequireStaffRole";

/* EMPLOYEE ROUTES */
import StaffLayout from "../pages/Staff/Home/StaffLayout";
import Home from "../pages/Staff/Home/Home";
import Scheduling from "../pages/Staff/Scheduling/Scheduling";
import Services from "../pages/Staff/Services/Services";
import Coupons from "../pages/Staff/Coupons/Coupons";
import Storage from "../pages/Staff/Stock/Stock";
import Revenue from "../pages/Staff/Revenue/Revenue";
import Communication from "../pages/Staff/Communication/Communication";

import Settings from "../pages/Staff/Profile/Settings";
import Profile from "../pages/Staff/Profile/Profile";

/* ADMIN ROUTES */
import Overview from "../pages/Admin/Overview"
import Employees from "../pages/Admin/Employees";
import Users from "../pages/Admin/Users";
import Logs from "../pages/Admin/Logs";
import Professions from "../pages/Admin/Professions";

/* OTHERS  ROUTES */
import ErrorPageDash from "../pages/Error/ErrorPageDash";

// Área do colaborador/admin (/staff/dashboard/*)
// Tudo aqui dentro só é montado se o token for de staff (RequireRole
// verifica isso ANTES de renderizar - quem não é staff nem chega a
// carregar o Dashboard, é redirecionado direto pro login).
export const staffRoutes = (
  <Route element={<RequireRole role="staff" />}>
    <Route key="dashboard" path="staff" element={<StaffLayout />}>
      <Route index element={<Home />} />
      <Route path="scheduling" element={<Scheduling />} />
      <Route path="profile" element={<Profile />} />
      <Route path="settings" element={<Settings />} />
      <Route path="services" element={<Services />} />
      <Route path="coupons" element={<Coupons />} />
      <Route path="storage" element={<Storage />} />
      <Route path="revenue" element={<Revenue />} />
      <Route path="communication" element={<Communication />} />

      {/* POR PERMISSÃO - Admin sempre entra; Manager/Employee só se tiverem a permissão
          (padrão do cargo ou personalizada pelo Admin). Quem tentar entrar direto
          pela URL volta pra "/staff". */}
      <Route element={<RequireStaffRole permission="overview.view" />}>
        <Route path="overview" element={<Overview />} />
      </Route>
      <Route element={<RequireStaffRole permission="customers.manage" />}>
        <Route path="users" element={<Users />} />
      </Route>

      {/* SÓ ADMIN - gestão de equipe, profissões e logs (não delegável) */}
      <Route element={<RequireStaffRole allow={["Admin"]} />}>
        <Route path="employees" element={<Employees />} />
        <Route path="professions" element={<Professions />} />
        <Route path="logs" element={<Logs />} />
      </Route>

      <Route path="*" element={<ErrorPageDash />} />
    </Route>
  </Route>
);
