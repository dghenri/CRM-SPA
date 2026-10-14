import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireUser, stockAuth } from '../middleware/auth.js';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_STATUSES,
  acceptsCategory,
  buildSystemAlerts,
  isInternalPath,
} from '../services/notifications.js';

const router = Router();

//=============================================================== NOTIFICAÇÕES E BANNERS

const SYSTEM_PREFIX = "sys-"; // id dos alertas calculados: "sys-profile-incomplete", "sys-welcome-coupon"...

function serializeSystemAlert(alert) {
  const { key, priority, ...rest } = alert;
  return { ...rest, id: `${SYSTEM_PREFIX}${key}`, system: true, read: false, createdAt: null };
}

function serializeStored(n) {
  return {
    id: n.id,
    system: false,
    status: n.status,
    title: n.title,
    description: n.description ?? null,
    actionLabel: n.actionLabel ?? null,
    actionPath: n.actionPath ?? null,
    dismissible: true,
    read: Boolean(n.readAt),
    createdAt: n.createdAt,
  };
}

//------------------------------------------------------------- CLIENTE: lista do sino
// Primeiro os alertas de estado (perfil incompleto etc.), depois as
// notificações guardadas, da mais nova pra mais antiga.
router.get('/notifications/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const [alerts, stored] = await Promise.all([
      buildSystemAlerts(req.user.id),
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    const items = [...alerts.map(serializeSystemAlert), ...stored.map(serializeStored)];
    // alerta de estado conta como "não lido" enquanto existir
    const unreadCount = alerts.length + stored.filter((n) => !n.readAt).length;

    res.json({ items, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar notificações." });
  }
});

//------------------------------------------------------------- CLIENTE: marcar tudo como lido (ao abrir o sino)
router.post('/notifications/me/read-all', authenticateToken, requireUser, async (req, res) => {
  try {
    const unread = (await prisma.notification.findMany({ where: { userId: req.user.id } })).filter((n) => !n.readAt);
    if (unread.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: unread.map((n) => n.id) } },
        data: { readAt: new Date() },
      });
    }
    res.json({ updated: unread.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao marcar notificações como lidas." });
  }
});

//------------------------------------------------------------- CLIENTE: dispensar uma notificação (botão X)
// - guardada: apaga a linha (só se for do próprio cliente)
// - alerta de estado dispensável: guarda a chave em User.dismissedAlertKeys
// - alerta obrigatório (perfil incompleto): recusa
router.delete('/notifications/me/:id', authenticateToken, requireUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith(SYSTEM_PREFIX)) {
      const key = id.slice(SYSTEM_PREFIX.length);
      const alerts = await buildSystemAlerts(req.user.id);
      const alert = alerts.find((a) => a.key === key);
      if (!alert) return res.status(200).json({ message: "Aviso já não está ativo." });
      if (!alert.dismissible) {
        return res.status(400).json({ error: "Este aviso some sozinho quando você concluir a ação." });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!(user.dismissedAlertKeys ?? []).includes(key)) {
        await prisma.user.update({ where: { id: req.user.id }, data: { dismissedAlertKeys: { push: key } } });
      }
      return res.status(200).json({ message: "Aviso dispensado." });
    }

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== req.user.id) {
      return res.status(404).json({ error: "Notificação não encontrada." });
    }
    await prisma.notification.delete({ where: { id } });
    res.status(200).json({ message: "Notificação removida." });
  } catch (error) {
    if (error.code === "P2023" || error.code === "P2025") {
      return res.status(404).json({ error: "Notificação não encontrada." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover notificação." });
  }
});

//------------------------------------------------------------- CLIENTE: banners do carrossel da Home
// Alertas de estado (mesma fonte do sino, na mesma ordem de prioridade; sem
// botão de dispensar) + banners ativos criados pela equipe.
router.get('/banners/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const now = new Date();
    const [alerts, banners] = await Promise.all([
      buildSystemAlerts(req.user.id),
      prisma.banner.findMany({ orderBy: { order: 'asc' } }),
    ]);

    // filtro de datas em JS (o conector Mongo não resolve bem filtro por DateTime opcional nulo)
    const live = banners.filter(
      (b) => b.isActive && (!b.startsAt || new Date(b.startsAt) <= now) && (!b.endsAt || new Date(b.endsAt) > now)
    );

    res.json([
      ...alerts.map((a) => ({
        id: `${SYSTEM_PREFIX}${a.key}`,
        system: true,
        status: a.status,
        title: a.title,
        description: a.description,
        buttonLabel: a.actionLabel,
        path: a.actionPath,
      })),
      ...live.map((b) => ({
        id: b.id,
        system: false,
        status: "Default",
        title: b.title,
        description: b.description ?? null,
        buttonLabel: b.buttonLabel ?? null,
        path: b.path ?? null,
      })),
    ]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar banners." });
  }
});

//=============================================================== EQUIPE: DISPAROS DE NOTIFICAÇÃO

function cleanText(value, max) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? null : text;
}

//------------------------------------------------------------- EQUIPE: histórico de disparos
router.get('/admin/notifications', ...stockAuth, async (req, res) => {
  try {
    const broadcasts = await prisma.notificationBroadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const rows = broadcasts.length
      ? await prisma.notification.findMany({ where: { broadcastId: { in: broadcasts.map((b) => b.id) } } })
      : [];

    const stats = {};
    for (const r of rows) {
      const s = (stats[r.broadcastId] ??= { delivered: 0, read: 0 });
      s.delivered += 1;
      if (r.readAt) s.read += 1;
    }

    res.json(broadcasts.map((b) => ({
      ...b,
      // "entregues" pode ser menor que recipientCount se o cliente dispensou (apagou) a dele
      delivered: stats[b.id]?.delivered ?? 0,
      readCount: stats[b.id]?.read ?? 0,
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar disparos." });
  }
});

//------------------------------------------------------------- EQUIPE: dispara uma notificação (todos os clientes ou clientes específicos)
router.post('/admin/notifications', ...stockAuth, async (req, res) => {
  try {
    const { status = "Default", category = "General", actionLabel, actionPath, audience = "all", userIds } = req.body;
    const title = cleanText(req.body.title, 80);
    const description = cleanText(req.body.description, 300);

    if (!title) return res.status(400).json({ error: "Informe um título (até 80 caracteres)." });
    if (description === null) return res.status(400).json({ error: "A mensagem pode ter no máximo 300 caracteres." });
    if (!NOTIFICATION_STATUSES.includes(status)) return res.status(400).json({ error: "Tipo de aviso inválido." });
    if (!NOTIFICATION_CATEGORIES.includes(category)) return res.status(400).json({ error: "Categoria inválida." });
    if (!["all", "selected"].includes(audience)) return res.status(400).json({ error: "Público inválido." });

    const label = cleanText(actionLabel ?? "", 24);
    const path = typeof actionPath === "string" ? actionPath.trim() : "";
    if (label === null) return res.status(400).json({ error: "O texto do botão pode ter no máximo 24 caracteres." });
    if (label && !path) return res.status(400).json({ error: "Informe para onde o botão leva." });
    if (path && !isInternalPath(path)) return res.status(400).json({ error: "O destino do botão precisa ser uma rota do app (ex: /user/coupons)." });

    let users;
    if (audience === "selected") {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "Escolha ao menos um cliente." });
      }
      users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    } else {
      users = await prisma.user.findMany({});
    }

    // respeita as preferências do cliente (promoções / novidades)
    const recipients = users.filter((u) => acceptsCategory(u, category));
    if (recipients.length === 0) {
      return res.status(400).json({ error: "Nenhum cliente receberia este aviso (preferências de notificação ou lista vazia)." });
    }

    const broadcast = await prisma.notificationBroadcast.create({
      data: {
        title, description: description || undefined, status, category,
        actionLabel: label || undefined, actionPath: path || undefined,
        audience, recipientCount: recipients.length,
        createdById: req.staff.id, createdByName: req.staff.name,
      },
    });

    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id, status, category, title,
        description: description || undefined,
        actionLabel: label || undefined, actionPath: path || undefined,
        kind: "broadcast", broadcastId: broadcast.id,
      })),
    });

    res.status(201).json({ ...broadcast, delivered: recipients.length, readCount: 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao disparar notificação." });
  }
});

//------------------------------------------------------------- EQUIPE: retira um disparo (some do sino de todos)
router.delete('/admin/notifications/:id', ...stockAuth, async (req, res) => {
  try {
    const broadcast = await prisma.notificationBroadcast.findUnique({ where: { id: req.params.id } });
    if (!broadcast) return res.status(404).json({ error: "Disparo não encontrado." });

    await prisma.notification.deleteMany({ where: { broadcastId: broadcast.id } });
    await prisma.notificationBroadcast.delete({ where: { id: broadcast.id } });
    res.status(200).json({ message: "Disparo removido." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao remover disparo." });
  }
});

//=============================================================== EQUIPE: BANNERS DO CARROSSEL

function bannerStatus(b, now = new Date()) {
  if (!b.isActive) return "inactive";
  if (b.startsAt && new Date(b.startsAt) > now) return "scheduled";
  if (b.endsAt && new Date(b.endsAt) <= now) return "expired";
  return "live";
}

// valida e normaliza o corpo (criação e edição usam as mesmas regras)
function parseBannerBody(body) {
  const title = cleanText(body.title, 60);
  const description = cleanText(body.description ?? "", 160);
  const buttonLabel = cleanText(body.buttonLabel ?? "", 24);
  const path = typeof body.path === "string" ? body.path.trim() : "";

  if (!title) return { error: "Informe um título (até 60 caracteres)." };
  if (description === null) return { error: "A descrição pode ter no máximo 160 caracteres." };
  if (buttonLabel === null) return { error: "O texto do botão pode ter no máximo 24 caracteres." };
  if (buttonLabel && !path) return { error: "Informe para onde o botão leva." };
  if (path && !isInternalPath(path)) return { error: "O destino do botão precisa ser uma rota do app (ex: /user/coupons)." };

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    return { error: "Datas inválidas." };
  }
  if (startsAt && endsAt && endsAt <= startsAt) return { error: "O fim precisa ser depois do início." };

  const order = Number.isFinite(Number(body.order)) ? Math.trunc(Number(body.order)) : 0;

  return {
    data: {
      title,
      description: description || null,
      buttonLabel: buttonLabel || null,
      path: path || null,
      isActive: body.isActive !== false,
      startsAt, endsAt, order,
    },
  };
}

router.get('/admin/banners', ...stockAuth, async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({ orderBy: { order: 'asc' } });
    res.json(banners.map((b) => ({ ...b, status: bannerStatus(b) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar banners." });
  }
});

router.post('/admin/banners', ...stockAuth, async (req, res) => {
  try {
    const { data, error } = parseBannerBody(req.body);
    if (error) return res.status(400).json({ error });

    const banner = await prisma.banner.create({ data: { ...data, createdByName: req.staff.name } });
    res.status(201).json({ ...banner, status: bannerStatus(banner) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar banner." });
  }
});

router.put('/admin/banners/:id', ...stockAuth, async (req, res) => {
  try {
    const { data, error } = parseBannerBody(req.body);
    if (error) return res.status(400).json({ error });

    const banner = await prisma.banner.update({ where: { id: req.params.id }, data });
    res.json({ ...banner, status: bannerStatus(banner) });
  } catch (error) {
    if (error.code === "P2025" || error.code === "P2023") return res.status(404).json({ error: "Banner não encontrado." });
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar banner." });
  }
});

// liga/desliga sem reenviar o corpo todo
router.patch('/admin/banners/:id/active', ...stockAuth, async (req, res) => {
  try {
    if (typeof req.body.isActive !== "boolean") return res.status(400).json({ error: "Informe isActive (true/false)." });
    const banner = await prisma.banner.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
    res.json({ ...banner, status: bannerStatus(banner) });
  } catch (error) {
    if (error.code === "P2025" || error.code === "P2023") return res.status(404).json({ error: "Banner não encontrado." });
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar banner." });
  }
});

router.delete('/admin/banners/:id', ...stockAuth, async (req, res) => {
  try {
    await prisma.banner.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: "Banner removido." });
  } catch (error) {
    if (error.code === "P2025" || error.code === "P2023") return res.status(404).json({ error: "Banner não encontrado." });
    console.error(error);
    res.status(500).json({ error: "Erro ao remover banner." });
  }
});

export default router;
