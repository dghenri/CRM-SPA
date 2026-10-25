import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/api";

// Contadores dos badges da sidebar (GET /staff/sidebar-badges).
// Atualiza: ao montar, a cada troca de página, ao voltar para a aba e a cada 60 s.
const REFRESH_MS = 60_000;

export default function useSidebarBadges(enabled = true) {
  const [counts, setCounts] = useState({});
  const { pathname } = useLocation();
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get("/staff/sidebar-badges");
      if (alive.current && data && typeof data === "object") setCounts(data);
    } catch (error) {
      // badge é só um detalhe visual: falhou, mantém o último valor
      console.error("Erro ao carregar os contadores da sidebar:", error);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ao montar e a cada troca de página (ex: depois de aprovar uma solicitação)
  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, pathname, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { counts, refresh };
}
