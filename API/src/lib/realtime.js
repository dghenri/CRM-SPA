import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from 'ws';
import { ACCESS_TOKEN_KEY } from './config.js';

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
  wss.on("connection", (ws, req) => {
    try {
      const { searchParams } = new URL(req.url, "http://localhost");
      const token = searchParams.get("token");
      const decoded = token && jwt.verify(token, ACCESS_TOKEN_KEY);

      if (!decoded || decoded.type !== "staff") {
        ws.close(4001, "Não autorizado.");
        return;
      }
    } catch (err) {
      ws.close(4001, "Não autorizado.");
      return;
    }

    // conexão autenticada - fica só esperando os broadcasts, não precisa
    // responder nada
  });
}
