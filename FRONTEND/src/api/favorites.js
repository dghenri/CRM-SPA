import api from "./api";

// ATENÇÃO: não tenho o conteúdo de api/api.js, então estou assumindo que
// api.get/post/delete devolvem os dados já resolvidos (assim como em
// `api.get("/services")` no ServiceDetail.jsx) e que a autenticação
// (Bearer token) já é adicionada automaticamente por esse cliente. Se
// api.post precisar de um segundo argumento (body) mesmo vazio, ajuste
// as chamadas abaixo.

// Lista os serviços favoritados pelo cliente logado
export function fetchMyFavorites() {
  return api.get("/users/me/favorites");
}

// Favorita um serviço; retorna a lista atualizada de favoritos
export function addFavorite(serviceId) {
  return api.post(`/users/me/favorites/${serviceId}`);
}

// Remove um favorito; retorna a lista atualizada de favoritos
export function removeFavorite(serviceId) {
  return api.delete(`/users/me/favorites/${serviceId}`);
}
