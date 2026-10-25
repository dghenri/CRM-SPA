import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requirePermission, stockAuth } from '../middleware/auth.js';
import { loadRecipe, recipeCost } from '../services/recipes.js';
import { round3 } from '../services/stock.js';

const router = Router();

//------------------------------------------------------------- GET ROUTE (resumo: nº de insumos e custo de cada procedimento - Admin)
router.get('/admin/recipes/summary', ...stockAuth, requirePermission('recipes.manage'), async (req, res) => {
  try {
    const [items, products] = await Promise.all([prisma.recipeItem.findMany(), prisma.product.findMany()]);
    const byProduct = new Map(products.map((p) => [p.id, p]));

    const grouped = new Map();
    for (const i of items) {
      if (!grouped.has(i.serviceId)) grouped.set(i.serviceId, []);
      grouped.get(i.serviceId).push({ quantity: i.quantity, product: byProduct.get(i.productId) });
    }

    const summary = {};
    for (const [serviceId, rows] of grouped) {
      summary[serviceId] = { items: rows.length, ...recipeCost(rows) };
    }
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar receitas." });
  }
});

//------------------------------------------------------------- GET ROUTE (receita de um procedimento - Admin)
router.get('/services/:id/recipe', ...stockAuth, requirePermission('recipes.manage'), async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!service) return res.status(404).json({ error: "Serviço não encontrado." });
    res.json(await loadRecipe(service.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar receita." });
  }
});

//------------------------------------------------------------- PUT ROUTE (substitui a receita inteira - Admin)
// Não é retroativa: atendimentos já concluídos mantêm o consumo que tiveram.
router.put('/services/:id/recipe', ...stockAuth, requirePermission('recipes.manage'), async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length > 30) {
      return res.status(400).json({ error: "Envie a lista de insumos (até 30)." });
    }

    const service = await prisma.service.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!service) return res.status(404).json({ error: "Serviço não encontrado." });

    const seen = new Set();
    const data = [];
    for (const raw of items) {
      const productId = String(raw.productId || "");
      const quantity = Number(raw.quantity);
      if (!productId) return res.status(400).json({ error: "Escolha o produto de cada insumo." });
      if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: "A quantidade de cada insumo deve ser maior que zero." });
      if (seen.has(productId)) return res.status(400).json({ error: "Há um insumo repetido na receita." });
      seen.add(productId);
      data.push({ serviceId: service.id, productId, quantity: round3(quantity) });
    }

    const products = await prisma.product.findMany({ where: { id: { in: data.map((d) => d.productId) } }, select: { id: true } });
    if (products.length !== data.length) return res.status(400).json({ error: "Produto não encontrado." });

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { serviceId: service.id } });
      if (data.length > 0) await tx.recipeItem.createMany({ data });
    });

    res.json(await loadRecipe(service.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar receita." });
  }
});

export default router;
