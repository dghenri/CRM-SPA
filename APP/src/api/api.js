// Cliente HTTP central da aplicação. Anexa o token JWT salvo no login
// (localStorage, chave "token") em toda requisição autenticada.
//
// Em dev normal, usa localhost:3000. Pra testar via túnel (Cloudflare,
// ngrok etc.), defina VITE_API_URL no seu .env com a URL pública da API
// (ex: VITE_API_URL=https://sua-api.trycloudflare.com) e reinicie o vite.
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store", // nunca reaproveita cache do navegador (evita 304 com corpo vazio)
  });

  // 204/No Content ou respostas sem corpo
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.error || `Erro ${res.status} ao acessar ${path}`);
    error.status = res.status;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};

export default api