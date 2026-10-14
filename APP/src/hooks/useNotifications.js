import { useCallback, useEffect, useRef, useState } from "react";
import {
  dismissNotification,
  fetchMyNotifications,
  markAllNotificationsRead,
} from "../api/notifications";

const REFRESH_MS = 60_000; // reconsulta a cada minuto (e sempre que a aba volta ao foco)

/**
 * Notificações do cliente logado (sino da Home).
 * - `items`: alertas de estado ("Complete seu perfil"...) + notificações guardadas
 * - `unreadCount`: o número do selo no sino
 * - `refresh()`: recarrega (chame ao abrir o sino, ou depois de uma ação)
 * - `dismiss(id)`: some na hora da tela e avisa o servidor (volta se o servidor recusar)
 * - `markAllRead()`: marca as guardadas como lidas (chame ao fechar o sino)
 */
export function useNotifications() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMyNotifications();
      if (!mounted.current) return;
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // sem rede / sessão expirada: mantém o que já está na tela
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const dismiss = useCallback(async (id) => {
    const previous = items;
    setItems((list) => list.filter((n) => n.id !== id));
    try {
      await dismissNotification(id);
      refresh();
    } catch {
      setItems(previous); // servidor recusou: devolve o aviso
    }
  }, [items, refresh]);

  const markAllRead = useCallback(async () => {
    if (!items.some((n) => !n.system && !n.read)) return;
    try {
      await markAllNotificationsRead();
      setItems((list) => list.map((n) => (n.system ? n : { ...n, read: true })));
      setUnreadCount(items.filter((n) => n.system).length);
    } catch {
      /* tenta de novo na próxima vez que o sino fechar */
    }
  }, [items]);

  return { items, unreadCount, isLoading, refresh, dismiss, markAllRead };
}
