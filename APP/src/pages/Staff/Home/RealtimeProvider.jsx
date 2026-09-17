import { useEffect, useRef } from "react";
import { notifyAppointmentsChanged } from "../Scheduling/Scheduling";

// Constrói a URL do WebSocket a partir da mesma env var usada pela API REST
// (VITE_API_URL), só trocando o protocolo http(s) -> ws(s).
function buildSocketUrl() {
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const wsBase = apiBase.replace(/^http/, "ws");
  const token = localStorage.getItem("token");
  return `${wsBase}/ws?token=${encodeURIComponent(token || "")}`;
}

// Fica montado na raiz de /staff (StaffLayout). Substitui o polling como
// forma PRINCIPAL de saber que algo mudou: o servidor avisa na hora (ver
// broadcastAppointmentsChanged no server.js) em vez de cada aba ficar
// perguntando de tempos em tempos. useAppointments() e a Agenda continuam
// com um poll bem mais espaçado só como rede de segurança, caso o socket
// caia e a reconexão demore.
export default function RealtimeProvider({ children }) {
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let socket = null;

    function connect() {
      if (cancelled) return;

      socket = new WebSocket(buildSocketUrl());

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "appointments-changed") {
            notifyAppointmentsChanged();
          }
        } catch {
          // mensagem que não é o JSON esperado - ignora
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        // reconecta com backoff crescente (1s, 2s, 4s... até 30s), pra não
        // martelar o servidor se ele cair por mais tempo
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    // Adia a primeira tentativa em um tick: em dev, o React StrictMode
    // monta, desmonta e monta de novo de propósito - sem isso, a primeira
    // chamada abria um WebSocket e o fechava antes de terminar de
    // conectar (gerando aquele aviso inofensivo no console). Adiando, o
    // "cancelled" do desmonte já está true quando o timeout dispara, então
    // esse primeiro socket nem chega a ser criado.
    const initialConnectTimeout = setTimeout(connect, 0);

    return () => {
      cancelled = true;
      clearTimeout(initialConnectTimeout);
      clearTimeout(reconnectTimeoutRef.current);
      socket?.close();
    };
  }, []);

  return children;
}
