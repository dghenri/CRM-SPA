import { useCallback, useEffect, useState } from "react";
import { fetchMyBanners } from "../api/notifications";

/**
 * Banners do carrossel da Home: alertas de estado (perfil incompleto, cupom de
 * boas-vindas, primeira sessão) + banners criados pela equipe. O servidor já
 * devolve na ordem certa e só o que vale agora.
 */
export function useBanners() {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setBanners(await fetchMyBanners());
    } catch {
      /* mantém o que já estava na tela */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [refresh]);

  return { banners, isLoading, refresh };
}
