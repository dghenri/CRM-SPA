import api from "./api";

/**
 * Lista os agendamentos do cliente logado (rota GET /appointments/me,
 * já existente no server.js - requireCustomer).
 */
export async function fetchMyAppointments() {
  return api.get("/appointments/me");
}

/**
 * Busca os intervalos JÁ OCUPADOS de um serviço dentro de uma janela de tempo
 * (normalmente um dia inteiro, de 00:00 a 00:00 do dia seguinte, no fuso local).
 *
 * `from` e `to` devem ser objetos Date (ou algo aceito por `new Date(...)`)
 * representando o início e fim da janela.
 *
 * Retorna: [{ date: "2026-08-25T12:00:00.000Z", endDate: "2026-08-25T13:00:00.000Z" }, ...]
 * (sem nenhum dado do cliente dono do agendamento - ver rota no server.js)
 */
export async function fetchBusyWindows(serviceId, from, to) {
  const params = new URLSearchParams({
    serviceId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  });

  return api.get(`/appointments/availability?${params.toString()}`);
}

/**
 * Cria um agendamento vinculado ao cliente logado (o back identifica o
 * cliente pelo token, não é preciso mandar customerId).
 *
 * `code`: código de 6 letras já mostrado na tela de confirmação antes do
 * agendamento existir de fato - o back tenta usar esse valor e só sorteia
 * outro se, por coincidência, ele já estiver em uso.
 *
 * `paymentMethod`: "Pix" | "CreditCard" | "DebitCard" | "Cash" - obrigatório
 * pro cliente (o back responde 400 sem ele); alimenta a página de receita.
 *
 * Nasce com status "Scheduled" (default do schema.prisma - o POST
 * /appointments do server.js nunca sobrescreve status na criação). Só vira
 * "Confirmed" depois que o cliente paga o sinal e a equipe confirma manualmente.
 */
export async function createAppointment({ serviceId, title, date, endDate, notes, code, paymentMethod }) {
  return api.post("/appointments", {
    serviceId,
    title,
    date: new Date(date).toISOString(),
    endDate: new Date(endDate).toISOString(),
    notes,
    code,
    paymentMethod,
  });
}
