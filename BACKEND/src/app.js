import express from 'express';
import cors from 'cors';

import staffRoutes from './routes/staff.js';
import servicesRoutes from './routes/services.js';
import usersRoutes from './routes/users.js';
import favoritesRoutes from './routes/favorites.js';
import accountRoutes from './routes/account.js';
import passwordRecoveryRoutes from './routes/passwordRecovery.js';
import appointmentsRoutes from './routes/appointments.js';
import couponsRoutes from './routes/coupons.js';
import productsRoutes from './routes/products.js';
import stockRoutes from './routes/stock.js';
import overviewRoutes from './routes/overview.js';
import overviewInsightsRoutes from './routes/overviewInsights.js';
import revenueRoutes from './routes/revenue.js';
import recipesRoutes from './routes/recipes.js';
import daySummaryRoutes from './routes/daySummary.js';
import notificationsRoutes from './routes/notifications.js';
import professionsRoutes from './routes/professions.js';
import sidebarBadgesRouter from './routes/sidebarBadges.js';
import logsRoutes from './routes/logs.js';
import { auditContextMiddleware } from './lib/auditContext.js';
import { startAuditRetention } from './lib/audit.js';
import { UPLOADS_DIR } from './lib/uploads.js';

export const app = express();

// Desliga o ETag automático do Express. Sem isso, o navegador pode receber
// um 304 Not Modified (corpo vazio) em vez do JSON de fato, achando que a
// resposta "não mudou" - o que quebra chamadas de API que sempre devem vir
// com dados frescos (como GET /appointments).
app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Origens permitidas
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
];

if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);
}

const ALLOW_TUNNELS = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        (ALLOW_TUNNELS &&
          /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin));

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(new Error("Origem não permitida por CORS."));
    },
  })
);

app.use(express.json())

// Auditoria: guarda quem está agindo (autor, IP) durante a requisição. Fica DEPOIS do express.json()
// de propósito: o body-parser perde o contexto assíncrono.
app.use(auditContextMiddleware);

// Verificação de saúde: serve para o Render saber que a API está de pé e para
// um monitor externo (UptimeRobot) acordá-la. Não consulta o banco de propósito.
app.get('/health', (req, res) => res.json({ ok: true }));

// Arquivos enviados (fotos de perfil). O nome muda a cada upload, então o
// navegador pode guardar em cache por bastante tempo.
app.use('/uploads', express.static(UPLOADS_DIR, {
  index: false,
  dotfiles: 'ignore',
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
}));

// A ORDEM importa só entre rotas do mesmo prefixo (ex: /users/me antes de
// /users/:id) - e isso já está garantido dentro de cada arquivo.
app.use(staffRoutes);        // /staff, /auth/staff/*
app.use(servicesRoutes);     // /services
app.use(usersRoutes);        // /auth/user/*, /users/*
app.use(favoritesRoutes);    // /users/me/favorites
app.use(accountRoutes);      // /users/me/password, /addresses, /notifications, /avatar
app.use(appointmentsRoutes); // /appointments (inclui iniciar atendimento)
app.use(couponsRoutes);      // /coupons
app.use(productsRoutes);     // /products, /stock/batches
app.use(stockRoutes);        // /stock/requests, /stock/movements
app.use(overviewRoutes);     // /admin/overview
app.use(overviewInsightsRoutes); // /admin/overview/chart, /coupons, /top-customers
app.use(revenueRoutes);      // /staff/revenue/summary, /chart, /payment-methods, /services, /transactions
app.use(recipesRoutes);      // /admin/recipes, /services/:id/recipe
app.use(daySummaryRoutes);   // /staff/day-summary
app.use(notificationsRoutes); // /notifications/me, /banners/me, /admin/notifications, /admin/banners
app.use(passwordRecoveryRoutes); // /auth/password/*, /auth/sessions/revoke-others
app.use(professionsRoutes); // /permissions/catalog, /professions
app.use(sidebarBadgesRouter); // /staff/sidebar-badges
app.use(logsRoutes);         // /admin/logs (permissão logs.view)

// apaga logs de auditoria com mais de RETENTION_DAYS (lib/audit.js)
startAuditRetention();