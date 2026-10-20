// Conexão única de tempo real (WebSocket) compartilhada por todas as telas.
//
// O servidor só avisa "algo mudou" ({ type: "stock-changed" } etc.); cada tela
// se inscreve no tipo que lhe interessa e recarrega seus dados por HTTP.
// Em vez de cada tela abrir o seu próprio socket (eram até 4 por aba), existe UM
// socket, aberto quando a primeira tela se inscreve e fechado quando a última sai.
//
// Também cuida de:
//  - reconectar sozinho com espera crescente (1s, 2s, 4s... até 30s) - inclusive
//    depois que a API "dorme" e acorda no Render grátis;
//  - mandar "ping" a cada 4 min: detecta conexão morta e conta como tráfego
//    (o servidor responde "pong");
//  - reconectar na hora quando a aba volta a ficar visível ou a internet volta;
//  - parar de insistir se o servidor recusar o token (código 4001 = sessão inválida).
//
// Uso:  useEffect(() => subscribeRealtime("stock-changed", load), [load]);

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const PING_MS = 4 * 60 * 1000;
const MAX_BACKOFF_MS = 30_000;
const CLOSE_GRACE_MS = 1_000; // o StrictMode monta/desmonta/monta: não fecha à toa

const handlers = new Map(); // tipo -> Set de funções
let socket = null;
let attempt = 0;
let retryTimer = null;
let pingTimer = null;
let closeTimer = null;
let rejected = false; // o servidor recusou o token

const subscriberCount = () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);

function buildUrl() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  return `${API_BASE.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
}

function open() {
  if (socket || rejected || subscriberCount() === 0) return;
  const url = buildUrl();
  if (!url) return; // sem login: nada para ouvir

  const ws = new WebSocket(url);
  socket = ws;

  ws.onopen = () => {
    attempt = 0;
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, PING_MS);
  };

  ws.onmessage = (event) => {
    if (event.data === "pong") return;
    try {
      const { type } = JSON.parse(event.data);
      handlers.get(type)?.forEach((fn) => {
        try { fn(); } catch (error) { console.error(error); }
      });
    } catch {
      /* mensagem que não é o JSON esperado: ignora */
    }
  };

  ws.onerror = () => ws.close();

  ws.onclose = (event) => {
    if (socket === ws) socket = null;
    clearInterval(pingTimer);
    if (event.code === 4001) { rejected = true; return; } // token inválido/sessão encerrada
    if (subscriberCount() === 0) return;
    attempt += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (attempt - 1)));
  };
}

function closeIfUnused() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (subscriberCount() > 0) return;
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    attempt = 0;
    const ws = socket;
    socket = null;
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close(); // evita o aviso do navegador
    else ws.close();
  }, CLOSE_GRACE_MS);
}

// Volta a tentar na hora (aba reaberta, internet de volta), sem esperar o backoff.
function wakeUp() {
  if (socket || subscriberCount() === 0) return;
  clearTimeout(retryTimer);
  attempt = 0;
  open();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", wakeUp);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wakeUp();
  });
}

/** Avisa `callback` toda vez que o servidor mandar `type`. Devolve a função que cancela. */
export function subscribeRealtime(type, callback) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(callback);

  clearTimeout(closeTimer);
  rejected = false; // uma tela nova pode ter vindo de um login novo: tenta de novo
  open();

  return () => {
    handlers.get(type)?.delete(callback);
    closeIfUnused();
  };
}
