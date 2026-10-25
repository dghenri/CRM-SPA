import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { broadcastStockChanged } from '../lib/realtime.js';
import { hasPermission } from '../lib/permissions.js';
import { requirePermission, stockAuth } from '../middleware/auth.js';
import { StockError, canHandleProduct, decorateBatch, optNumber, sortFefo } from '../services/stock.js';

const router = Router();

//=============================================================== PRODUTOS

async function parseProductBody(body, { partial = false } = {}) {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("name")) {
    if (!body.name?.trim()) throw new StockError("Informe o nome do produto.");
    data.name = body.name.trim();
  }
  if (!partial || has("unit")) {
    if (!["Un", "Ml", "G"].includes(body.unit)) throw new StockError("Unidade inválida (Un, Ml ou G).");
    data.unit = body.unit;
  }
  if (has("sku")) data.sku = body.sku?.trim() || null;
  if (has("category")) data.category = body.category?.trim() || null;
  if (has("active")) data.active = !!body.active;
  if (has("purchaseUnitLabel")) data.purchaseUnitLabel = body.purchaseUnitLabel?.trim() || null;
  if (has("purchaseUnitSize")) {
    const size = Number(body.purchaseUnitSize);
    if (!(size > 0)) throw new StockError("O tamanho da embalagem deve ser maior que zero.");
    data.purchaseUnitSize = size;
  }
  if (has("minStock")) {
    const min = Number(body.minStock) || 0;
    if (min < 0) throw new StockError("Estoque mínimo inválido.");
    data.minStock = min;
  }
  if (has("trackOpening")) data.trackOpening = !!body.trackOpening;
  if (has("shelfLifeAfterOpenHours")) {
    const h = optNumber(body.shelfLifeAfterOpenHours);
    data.shelfLifeAfterOpenHours = h && h > 0 ? Math.round(h) : null;
  }
  if (has("allowedProfessionIds")) {
    // profissões (Profession) que podem solicitar movimentações deste produto.
    // Quem tem a permissão "stock.review" (Admin/Manager) sempre pode; não precisa ficar na lista.
    const ids = body.allowedProfessionIds;
    if (!Array.isArray(ids) || ids.some((id) => !/^[a-f\d]{24}$/i.test(String(id)))) {
      throw new StockError("Profissões permitidas inválidas.");
    }
    const unique = [...new Set(ids.map(String))];
    const found = await prisma.profession.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new StockError("Alguma das profissões informadas não existe.");
    data.allowedProfessionIds = unique;
  }
  return data;
}

//------------------------------------------------------------- GET ROUTE (lista produtos com saldo, lotes e alertas - toda a equipe vê)
router.get('/products', ...stockAuth, async (req, res) => {
  try {
    const includeInactive = hasPermission(req.staff, "products.manage") && req.query.includeInactive === "true";
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    const visible = includeInactive ? products : products.filter((p) => p.active);

    const batches = await prisma.stockBatch.findMany({
      where: { productId: { in: visible.map((p) => p.id) }, quantity: { gt: 0 } },
    });
    const batchesByProduct = new Map();
    for (const b of batches) {
      if (!batchesByProduct.has(b.productId)) batchesByProduct.set(b.productId, []);
      batchesByProduct.get(b.productId).push(b);
    }

    const now = new Date();
    res.json(visible.map((p) => {
      const productBatches = sortFefo(batchesByProduct.get(p.id) || []).map((b) => decorateBatch(b, p, now));
      return {
        ...p,
        canRequest: canHandleProduct(req.staff, p),
        batches: productBatches,
        alerts: {
          lowStock: p.minStock > 0 && p.currentStock <= p.minStock,
          expired: productBatches.some((b) => b.isExpired),
          expiringSoon: productBatches.some((b) => b.isExpiringSoon),
          openedExpired: productBatches.some((b) => b.isOpenedExpired),
        },
      };
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar produtos." });
  }
});

//------------------------------------------------------------- POST ROUTE (products.manage cadastra produto - saldo nasce zerado, entra só via movimentação)
router.post('/products', ...stockAuth, requirePermission('products.manage'), async (req, res) => {
  try {
    const data = await parseProductBody(req.body);
    const product = await prisma.product.create({ data });
    broadcastStockChanged();
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe um produto com esse SKU." });
    console.error(error);
    res.status(500).json({ error: "Erro ao criar produto." });
  }
});

//------------------------------------------------------------- PUT ROUTE (products.manage edita produto; currentStock NÃO é editável aqui)
router.put('/products/:id', ...stockAuth, requirePermission('products.manage'), async (req, res) => {
  try {
    const data = await parseProductBody(req.body, { partial: true });
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    broadcastStockChanged();
    res.json(product);
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe um produto com esse SKU." });
    if (error.code === "P2025") return res.status(404).json({ error: "Produto não encontrado." });
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar produto." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (registra a abertura de um frasco/lote)
// Não mexe em saldo, então não precisa de aprovação: basta ter permissão no produto.
router.patch('/stock/batches/:id/open', ...stockAuth, async (req, res) => {
  try {
    const batch = await prisma.stockBatch.findUnique({ where: { id: req.params.id }, include: { product: true } });
    if (!batch) return res.status(404).json({ error: "Lote não encontrado." });
    if (!canHandleProduct(req.staff, batch.product)) {
      return res.status(403).json({ error: "Você não tem permissão para este produto." });
    }
    if (!batch.product.trackOpening) {
      return res.status(400).json({ error: "Este produto não controla abertura de frasco." });
    }
    if (batch.openedAt) return res.status(409).json({ error: "Este frasco já foi marcado como aberto." });
    if (batch.quantity <= 0) return res.status(400).json({ error: "Este lote está vazio." });

    let openedAt = new Date();
    if (req.body?.openedAt) {
      openedAt = new Date(req.body.openedAt);
      if (Number.isNaN(openedAt.getTime()) || openedAt > new Date()) {
        return res.status(400).json({ error: "Data de abertura inválida." });
      }
    }

    await prisma.stockBatch.update({ where: { id: batch.id }, data: { openedAt } });

    broadcastStockChanged();
    const updated = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
    res.json(decorateBatch(updated, batch.product));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao registrar abertura." });
  }
});

export default router;
