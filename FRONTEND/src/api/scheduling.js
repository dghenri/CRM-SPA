import api from "./api";

/**
 * Chamadas de API usadas pela página de agenda da equipe (Scheduling.jsx).
 * Extraído do componente só pra tirar o "ruído" de fetch/endpoint de lá -
 * a lógica de estado otimista (aplicar antes, desfazer se der erro) continua
 * no componente, aqui é só o transporte HTTP.
 */

// Carrega tudo que a agenda precisa pra montar a tela inicial: os
// agendamentos, a lista de clientes (pro seletor) e os serviços (idem).
export function fetchSchedulingData() {
  return Promise.all([
    api.get("/appointments"),
    api.get("/users"),
    api.get("/services"),
  ]).then(([appointments, clients, services]) => ({ appointments, clients, services }));
}

// Só os agendamentos - usado por quem não precisa de clientes/serviços
// (ex: o widget "Sessão atual" da Home, via useAppointments)
export function fetchAppointments() {
  return api.get("/appointments");
}

export function createAppointment(payload) {
  return api.post("/appointments", payload);
}

export function updateAppointment(id, payload) {
  return api.put(`/appointments/${id}`, payload);
}

export function deleteAppointment(id) {
  return api.delete(`/appointments/${id}`);
}

export function updateAppointmentStatus(id, status) {
  return api.patch(`/appointments/${id}/status`, { status });
}
