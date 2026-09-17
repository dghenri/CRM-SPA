import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import ErrorPage from "../pages/Error/ErrorPage";

import { publicRoutes } from "./publicRoutes";
import { userRoutes } from "./userRoutes";
import { staffRoutes } from "./staffRoutes";

export default function Router() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Layout global */}
          <Route path="/" element={<App />}>
            {publicRoutes}
            {userRoutes}
            {staffRoutes}
            <Route path="*" element={<ErrorPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
