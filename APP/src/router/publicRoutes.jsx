import { Route } from "react-router-dom";

import LandingPage from "../pages/Public/Landing/Landing";
import Login from "../pages/Public/Auth/Login";
import Register from "../pages/Public/Auth/Register";
import Recovery from "../pages/Public/Auth/RecoveryPassword";

// Rotas públicas: acessíveis sem autenticação
export const publicRoutes = [
  <Route key="landing" index element={<LandingPage />} />,
  <Route key="login" path="/auth/login" element={<Login />} />,
  <Route key="register" path="/register" element={<Register />} />,
  <Route key="recovery" path="/recovery" element={<Recovery />} />,
  <Route key="recovery" path="/recovery" element={<Recovery />} />,
];
