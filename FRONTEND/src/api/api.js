// Cliente HTTP central da aplicação. Anexa o token JWT salvo no login
// (localStorage, chave "token") em toda requisição autenticada.
//
// Em dev normal, usa localhost:3000. Pra testar via túnel (Cloudflare,
<<<<<<< HEAD
// ngrok etc.), defina VITE_BACKEND_URL no seu .env com a URL pública da API
// (ex: VITE_BACKEND_URL=https://sua-api.trycloudflare.com) e reinicie o vite.
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
=======
// ngrok etc.), defina BACKEND_URL no seu .env com a URL pública da API
// (ex: BACKEND_URL=https://sua-api.trycloudflare.com) e reinicie o vite.
const API_BASE_URL = import.meta.env.BACKEND_URL || "http://localhost:3000";
>>>>>>> 1c284c745545ae9c1d0242dcf091806ced6143af

// Endereço público de um arquivo guardado no servidor (ex: foto de perfil).
// A API devolve só o caminho ("/uploads/avatars/abc.jpg"); aqui vira URL completa.
export const assetUrl = (path) => (!path ? undefined : /^(https?:|data:|blob:)/.test(path) ? path : `${API_BASE_URL}${path}`);

async function request(path, { method = "GET", body } = {}) {
  // FormData (upload de arquivo): o navegador monta o Content-Type sozinho, com o
  // "boundary" do multipart - por isso não se define o header nem se usa JSON.stringify
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
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