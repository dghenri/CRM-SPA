import api from "./api";

/* ------------------------------ cliente --------------------------------- */

// { items: [...], unreadCount } - alertas de estado primeiro, depois as notificações guardadas
export const fetchMyNotifications = () => api.get("/notifications/me");
export const markAllNotificationsRead = () => api.post("/notifications/me/read-all");
// `id` pode ser de uma notificação guardada ou de um alerta de estado ("sys-...")
export const dismissNotification = (id) => api.delete(`/notifications/me/${encodeURIComponent(id)}`);
// banners do carrossel da Home: [{ id, system, status, title, description, buttonLabel, path }]
export const fetchMyBanners = () => api.get("/banners/me");

/* ------------------------------ equipe ---------------------------------- */

export const fetchBroadcasts = () => api.get("/admin/notifications");
export const sendBroadcast = (payload) => api.post("/admin/notifications", payload);
export const deleteBroadcast = (id) => api.delete(`/admin/notifications/${id}`);

export const fetchAdminBanners = () => api.get("/admin/banners");
export const createBanner = (payload) => api.post("/admin/banners", payload);
export const updateBanner = (id, payload) => api.put(`/admin/banners/${id}`, payload);
export const setBannerActive = (id, isActive) => api.patch(`/admin/banners/${id}/active`, { isActive });
export const deleteBanner = (id) => api.delete(`/admin/banners/${id}`);
