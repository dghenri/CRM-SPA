import { prisma } from '../lib/prisma.js';

//=============================================================== ESTOQUE (INSUMOS)
//
// Modelo: ledger (StockMovement) + lotes (StockBatch) + cache de saldo
// (Product.currentStock). Nada altera saldo sem passar por applyStockItems(),
// sempre dentro de uma $transaction.
//
// - MajorAdmin aplica direto (a solicitação é gravada já como Approved, só
//   pra manter a auditoria uniforme).
// - Demais cargos criam uma StockRequest (Pending) e o MajorAdmin aprova/nega.
// - Entrada (Purchase), Loss e Adjustment passam por aprovação. Consumo por
//   receita (fase 2) é automático e não passa por aqui.

export const MAJOR_ADMIN = "MajorAdmin";
const REQUESTABLE_TYPES = ["Purchase", "Loss", "Adjustment"];
const EXPIRING_SOON_DAYS = 30;

// evita lixo de ponto flutuante (0.1 + 0.2) no saldo
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export class StockError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}


export function canHandleProduct(staff, product) {
  return staff.role === MAJOR_ADMIN || (product.allowedRoles || []).includes(staff.role);
}

// ordem FEFO: vence primeiro, sai primeiro. Lotes sem validade vão por último.
// Feito em JS (expiresAt é opcional e filtros de null no conector Mongo do Prisma são instáveis).
export function sortFefo(batches) {
  return [...batches].sort((a, b) => {
    const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
    const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
    if (ae !== be) return ae - be;
    return new Date(a.receivedAt) - new Date(b.receivedAt);
  });
}

// quando o frasco aberto deixa de valer
export function openedExpiresAt(batch, product) {
  if (!batch.openedAt || !product.shelfLifeAfterOpenHours) return null;
  return new Date(new Date(batch.openedAt).getTime() + product.shelfLifeAfterOpenHours * 3600 * 1000);
}

export function decorateBatch(batch, product, now = new Date()) {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400 * 1000);
  const openedExp = openedExpiresAt(batch, product);
  return {
    ...batch,
    openedExpiresAt: openedExp,
    isExpired: !!(batch.expiresAt && new Date(batch.expiresAt) <= now),
    isExpiringSoon: !!(batch.expiresAt && new Date(batch.expiresAt) > now && new Date(batch.expiresAt) <= soon),
    isOpenedExpired: !!(openedExp && openedExp <= now),
  };
}

// valor opcional vindo do front: "" / undefined / null => undefined
export const optNumber = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

//------------------------------------------------------------- núcleo: aplica itens no estoque (SEMPRE dentro de uma transação)
// `tx` é o client da transação. Lança StockError (e a transação inteira é desfeita).
export async function decrementBatch(tx, batch, qty, product) {
  // updateMany condicional = proteção contra concorrência: só abate se ainda tem saldo
  const r = await tx.stockBatch.updateMany({
    where: { id: batch.id, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  if (r.count !== 1) {
    throw new StockError(`Saldo insuficiente no lote${batch.lotNumber ? ` ${batch.lotNumber}` : ""} de ${product.name}.`, 409);
  }
}

export async function applyStockItems(tx, { type, items, staffId, requestId, reason }) {
  for (const item of items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new StockError("Produto não encontrado.", 404);
    if (!product.active) throw new StockError(`O produto ${product.name} está inativo.`);

    const movementBase = { type, productId: product.id, staffId, requestId: requestId || undefined, reason: reason || undefined };
    let delta = 0;

    if (type === "Purchase") {
      // trackOpening: 1 lote por embalagem (cada frasco abre em momentos diferentes)
      const splitByPackage = product.trackOpening && item.packages && Number.isInteger(item.packages);
      const parts = splitByPackage
        ? Array.from({ length: item.packages }, () => round3(item.quantity / item.packages))
        : [round3(item.quantity)];

      for (const qty of parts) {
        const batch = await tx.stockBatch.create({
          data: {
            productId: product.id,
            quantity: qty,
            lotNumber: item.lotNumber || undefined,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            unitCost: item.unitCost ?? undefined,
          },
        });
        await tx.stockMovement.create({
          data: { ...movementBase, batchId: batch.id, quantity: qty, unitCost: item.unitCost ?? undefined },
        });
        delta += qty;
      }
      if (item.unitCost != null) {
        await tx.product.update({ where: { id: product.id }, data: { lastCost: item.unitCost } });
      }
    } else if (type === "Loss") {
      let remaining = round3(item.quantity);
      let candidates;
      if (item.batchId) {
        const b = await tx.stockBatch.findUnique({ where: { id: item.batchId } });
        if (!b || b.productId !== product.id) throw new StockError("Lote inválido para este produto.");
        candidates = [b];
      } else {
        candidates = sortFefo(await tx.stockBatch.findMany({ where: { productId: product.id, quantity: { gt: 0 } } }));
      }
      for (const b of candidates) {
        if (remaining <= 0) break;
        const take = round3(Math.min(b.quantity, remaining));
        if (take <= 0) continue;
        await decrementBatch(tx, b, take, product);
        await tx.stockMovement.create({ data: { ...movementBase, batchId: b.id, quantity: -take } });
        remaining = round3(remaining - take);
        delta -= take;
      }
      if (remaining > 0) throw new StockError(`Saldo insuficiente de ${product.name}.`, 409);
    } else if (type === "Adjustment") {
      const b = item.batchId ? await tx.stockBatch.findUnique({ where: { id: item.batchId } }) : null;
      if (!b || b.productId !== product.id) throw new StockError("Informe um lote válido para o ajuste.");
      const qty = round3(item.quantity);
      if (qty < 0) {
        await decrementBatch(tx, b, -qty, product);
      } else {
        await tx.stockBatch.update({ where: { id: b.id }, data: { quantity: { increment: qty } } });
      }
      await tx.stockMovement.create({ data: { ...movementBase, batchId: b.id, quantity: qty } });
      delta += qty;
    } else {
      throw new StockError("Tipo de movimentação inválido.");
    }

    // cache do saldo (confere com a soma do ledger)
    await tx.product.update({ where: { id: product.id }, data: { currentStock: { increment: round3(delta) } } });
  }
}

//------------------------------------------------------------- valida e normaliza os itens recebidos do front
export async function normalizeRequestItems(type, rawItems, staff) {
  if (!REQUESTABLE_TYPES.includes(type)) throw new StockError("Tipo inválido. Use Purchase, Loss ou Adjustment.");
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new StockError("Adicione ao menos um item.");
  if (rawItems.length > 50) throw new StockError("Itens demais em uma única solicitação.");

  const products = await prisma.product.findMany({ where: { id: { in: rawItems.map((i) => String(i.productId)) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = [];

  for (const raw of rawItems) {
    const product = byId.get(String(raw.productId));
    if (!product) throw new StockError("Produto não encontrado.", 404);
    if (!product.active) throw new StockError(`O produto ${product.name} está inativo.`);
    if (!canHandleProduct(staff, product)) {
      throw new StockError(`Você não tem permissão para movimentar ${product.name}.`, 403);
    }

    const item = { productId: product.id };

    if (type === "Purchase") {
      const packages = Number(raw.packages);
      if (!Number.isFinite(packages) || packages <= 0) throw new StockError(`Informe a quantidade de ${product.purchaseUnitLabel || "embalagens"} de ${product.name}.`);
      item.packages = packages;
      item.quantity = round3(packages * product.purchaseUnitSize);
      if (raw.lotNumber?.trim()) item.lotNumber = raw.lotNumber.trim();
      if (raw.expiresAt) {
        const d = new Date(raw.expiresAt);
        if (Number.isNaN(d.getTime())) throw new StockError("Validade inválida.");
        item.expiresAt = d;
      }
      // o front manda o custo POR EMBALAGEM; guardamos por unidade base
      const packageCost = optNumber(raw.packageCost);
      if (packageCost !== undefined) {
        if (!(packageCost >= 0)) throw new StockError("Custo inválido.");
        item.unitCost = round3(packageCost / product.purchaseUnitSize);
      }
    } else {
      const qty = Number(raw.quantity);
      if (!Number.isFinite(qty) || qty === 0) throw new StockError(`Informe a quantidade de ${product.name}.`);
      if (type === "Loss" && qty < 0) throw new StockError("Em perdas, informe a quantidade como valor positivo.");
      item.quantity = round3(qty);
      if (raw.batchId) item.batchId = String(raw.batchId);
      if (type === "Adjustment" && !item.batchId) throw new StockError(`Escolha o lote de ${product.name} para o ajuste.`);
    }

    out.push(item);
  }
  return out;
}

//------------------------------------------------------------- serialização: anexa nome/unidade do produto aos itens da solicitação
export async function serializeRequests(requests) {
  const ids = [...new Set(requests.flatMap((r) => r.items.map((i) => i.productId)))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  return requests.map((r) => ({
    ...r,
    items: r.items.map((i) => {
      const p = byId.get(i.productId);
      return {
        ...i,
        productName: p?.name ?? "(produto removido)",
        unit: p?.unit,
        purchaseUnitLabel: p?.purchaseUnitLabel,
      };
    }),
  }));
}

export const requestInclude = {
  requestedBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true } },
};
