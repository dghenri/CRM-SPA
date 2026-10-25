import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { decodeToken, isTokenValid } from "../utils/jwt";

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Staff e cliente têm endpoints "/me" diferentes agora - decide qual
// bater com base no "type" gravado no próprio token.
async function fetchCurrentUser(token) {
  const decoded = decodeToken(token);
  const path = decoded?.type === "staff" ? "/auth/staff/me" : "/users/me";

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Roda só uma vez, no mount: tenta restaurar a sessão a partir do
  // token salvo no localStorage. Enquanto isso não termina, "loading"
  // fica true - quem depende do contexto (ex: RequireRole) deve
  // esperar loading virar false antes de decidir qualquer coisa.
  useEffect(() => {
    const storedToken = localStorage.getItem("token");

    if (!storedToken || !isTokenValid(storedToken)) {
      if (storedToken) localStorage.removeItem("token"); // token expirado sobrando no storage
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    fetchCurrentUser(storedToken)
      .then((dbUser) => {
        if (!dbUser) {
          // token rejeitado pelo backend (expirado/inválido/revogado):
          // limpa e trata como deslogado
          localStorage.removeItem("token");
          setToken(null);
          setUser(null);
          return;
        }
        setUser(dbUser);
      })
      .finally(() => setLoading(false));
  }, []);

  // login recebe o token E o usuário que a API já retorna em
  // /auth/staff/login ou /auth/user/login
  const login = (newToken, dbUser) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(dbUser);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    navigate("/auth/login");
  };

  // usado depois de salvar o Profile: atualiza o usuário em memória
  // com o que a API devolveu, sem precisar buscar tudo de novo
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
  };

  // Permissões (ver BACKEND/src/lib/permissions.js): o back-end devolve `effectivePermissions`
  // (cargo + personalização do Admin). Aqui é só pra mostrar/esconder UI - quem protege de
  // verdade é o back-end. Ex: can("stock.review")
  const can = (permission) => !!user?.effectivePermissions?.includes(permission);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, updateUser, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth precisa ser usado dentro de um <AuthProvider>");
  }
  return ctx;
}
