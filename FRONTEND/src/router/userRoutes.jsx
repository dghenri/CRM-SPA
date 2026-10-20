import { Route } from "react-router-dom";

import RequireRole from "../components/RequireRole";

import UserLayout from "../pages/Client/Home/UserLayout";
import UserHome from "../pages/Client/Home/Home";
import SchedulingLayout from "../pages/Client/Scheduling/SchedulingLayout";
import UserServices from "../pages/Client/Services/Services";
import UserProfile from "../pages/Client/Profile/Profile";
import Account from "../pages/Client/Profile/Account";
import ServiceDetail from "../components/ServiceDetail";
import NewScheduling from "../components/NewScheduling";
import Coupons from "../pages/Client/Coupons/Coupons";

// Área do cliente (/user/*) - só monta se o token for de "user"
export const userRoutes = (
  <Route element={<RequireRole role="user" />}>
    <Route key="user" path="user" element={<UserLayout />}>
      <Route index element={<UserHome />} />
      <Route path="services" element={<UserServices />} />
      <Route path="services/:id" element={<ServiceDetail />} />
      <Route path="scheduling" element={<SchedulingLayout />} />
      <Route path="scheduling/new" element={<NewScheduling />} />
      <Route path="coupons" element={<Coupons />} />

      <Route path="profile" element={<UserProfile />} />
      <Route path="account" element={<Account />} />
    </Route>
  </Route>
);
