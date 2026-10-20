// Base da API do backend Express (server.js roda na porta 3000).
// Ajuste VITE_BACKEND_URL no seu .env se o backend estiver em outro endereço.
const API_BASE = import.meta.env?.VITE_BACKEND_URL || "http://localhost:3000";

// ATENÇÃO: presumi que o token JWT (retornado por /auth/login) fica salvo
// em localStorage sob a chave "token". Se no seu login.jsx/auth context
// você salva com outra chave (ou em outro lugar, tipo um AuthContext),
// ajuste a função abaixo — só ela precisa mudar.
function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Erro na requisição.");
  }
  return res.status === 204 ? null : res.json();
}

// GET /services é público — não precisa de token.
export function fetchServices() {
  return fetch(`${API_BASE}/services`).then(handleResponse);
}

export function createService(data) {
  return fetch(`${API_BASE}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  }).then(handleResponse);
}

export function updateService(id, data) {
  return fetch(`${API_BASE}/services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  }).then(handleResponse);
}

export function deleteService(id) {
  return fetch(`${API_BASE}/services/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  }).then(handleResponse);
}
