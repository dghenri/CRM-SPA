import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from 'ws';
import { ACCESS_TOKEN_KEY } from './config.js';
import { isSessionRevoked } from './sessionRevocation.js';

//------------------------------------------------------------- WEBSOCKET (avisos em tempo real pra equipe)
// Substitui o polling: em vez de cada aba da equipe perguntar "mudou
// alguma coisa?" de tempos em tempos, o servidor avisa na hora que algo
// muda. O front escuta essa mensagem e recarrega os dados (não mandamos os
// dados em si pelo socket, só o aviso - mantém o front simples e a
// resposta HTTP como única fonte de verdade dos dados).
let wss = null;

export function broadcastToStaff(type) {
  if (!wss) return;
  const payload = JSON.stringify({ type });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function broadcastAppointmentsChanged() {
  broadcastToStaff("appointments-changed");
}

// estoque: produtos, lotes ou solicitações mudaram (o front recarrega a tela)
export function broadcastStockChanged() {
  broadcastToStaff("stock-changed");
}

// Liga o canal de WebSocket ao servidor HTTP (chamado uma vez no server.js)
export function attachRealtime(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  // Autenticação do socket: o handshake de WebSocket não manda header
  // Authorization, então o front passa o token JWT como query string
  // (?token=...). Só a equipe precisa desses avisos - clientes não têm essa
  // tela aberta o tempo todo, então nem participam do canal.
  wss.on("connection", async (ws, req) => {
    try {
      const { searchParams } = new URL(req.url, "http://localhost");
      const token = searchParams.get("token");
      const decoded = token && jwt.verify(token, ACCESS_TOKEN_KEY);

      if (!decoded || decoded.type !== "staff") {
        ws.close(4001, "Não autorizado.");
        return;
      }

      // sessão encerrada ("sair de outros dispositivos") ou conta removida
      if (await isSessionRevoked(decoded)) {
        ws.close(4001, "Sessão encerrada.");
        return;
      }
    } catch (err) {
      ws.close(4001, "Não autorizado.");
      return;
    }

    // conexão autenticada. Heartbeat da aplicação: o front manda "ping" de
    // tempos em tempos e recebe "pong". Além de detectar conexão morta, isso
    // conta como tráfego e evita que o Render (plano grátis) hiberne a API
    // enquanto alguém da equipe está com o sistema aberto.
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; }); // pong do protocolo (resposta ao ping do servidor)
    ws.on("message", (data) => {
      ws.isAlive = true;
      if (String(data) === "ping" && ws.readyState === WebSocket.OPEN) ws.send("pong");
    });
  });

  // Derruba conexões que não responderam ao ping do servidor (aba fechada
  // sem aviso, rede caiu) - sem isso elas ficariam na memória para sempre.
  const sweep = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(sweep));
}
