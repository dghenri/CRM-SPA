import express from 'express';
import cors from 'cors';

import staffRoutes from './routes/staff.js';
import servicesRoutes from './routes/services.js';
import usersRoutes from './routes/users.js';
import favoritesRoutes from './routes/favorites.js';
import accountRoutes from './routes/account.js';
import appointmentsRoutes from './routes/appointments.js';
import couponsRoutes from './routes/coupons.js';
import productsRoutes from './routes/products.js';
import stockRoutes from './routes/stock.js';
import overviewRoutes from './routes/overview.js';
import recipesRoutes from './routes/recipes.js';
import daySummaryRoutes from './routes/daySummary.js';
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

// Origens sempre liberadas (dev local). Pra testar via túnel, defina no
// .env: FRONTEND_URL=https://sua-url-do-tunel.trycloudflare.com
const ALLOWED_ORIGINS = ["http://localhost:5173"];
if (process.env.FRONTEND_URL) ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);

app.use(cors({
  origin(origin, callback) {
    // requisições sem "origin" (ex: curl, Postman) não passam por CORS
    if (!origin) return callback(null, true);

    const isAllowed =
      ALLOWED_ORIGINS.includes(origin) ||
      // túneis rápidos do Cloudflare geram um subdomínio aleatório a cada
      // execução (ex: https://abc-def.trycloudflare.com) - liberamos o
      // domínio inteiro só pra facilitar testes, não use isso em produção
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin);

    callback(isAllowed ? null : new Error("Origem não permitida por CORS."), isAllowed);
  },
}))
app.use(express.json())

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
app.use(recipesRoutes);      // /admin/recipes, /services/:id/recipe
app.use(daySummaryRoutes);   // /staff/day-summary
