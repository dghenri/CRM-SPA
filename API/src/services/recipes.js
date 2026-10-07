import { prisma } from '../lib/prisma.js';
import { decrementBatch, openedExpiresAt, round3, sortFefo } from './stock.js';

//=============================================================== RECEITAS (INSUMOS POR PROCEDIMENTO) + CONSUMO AUTOMÁTICO
// Como funciona:
// - Receita = RecipeItem (procedimento x produto x quantidade por execução).
// - Ao CONCLUIR um atendimento ("Completed"), cada insumo da receita vira uma
//   movimentação Consumption (negativa), tirada dos lotes:
//     * frascos já ABERTOS primeiro, depois o que vence primeiro (FEFO);
//     * lote vencido (ou frasco aberto fora da validade) NUNCA é usado;
//     * produto com controle de abertura: o lote usado pela 1ª vez é marcado
//       como aberto (na data do atendimento).
// - Ao sair de "Completed" (reabrir, cancelar, não compareceu) ou ao excluir o
//   atendimento, o consumo é ESTORNADO (Return) nos mesmos lotes.
// - Idempotente: só age quando o status muda (ou o procedimento muda num
//   atendimento concluído); salvar de novo não baixa o estoque duas vezes.
// - Falta de estoque NÃO trava o atendimento: baixa o que houver e devolve
//   `stockWarnings` na resposta (o estoque nunca fica negativo).

const CONSUMPTION_EPS = 0.0005;

// lote que pode ser usado em paciente: não vencido e, se aberto, dentro da validade pós-abertura
function isUsableForConsumption(batch, product, now) {
  if (batch.expiresAt && new Date(batch.expiresAt) <= now) return false;
  const openedExp = openedExpiresAt(batch, product);
  if (openedExp && openedExp <= now) return false;
  return true;
}

// termina o frasco aberto antes de abrir outro; dentro de cada grupo, FEFO
function sortForConsumption(batches) {
  return [...sortFefo(batches.filter((b) => b.openedAt)), ...sortFefo(batches.filter((b) => !b.openedAt))];
}

// consumo líquido já lançado para o atendimento, por lote: Consumption(-) + Return(+)
async function netConsumptionByBatch(tx, appointmentId) {
  const movements = await tx.stockMovement.findMany({
    where: { appointmentId, type: { in: ["Consumption", "Return"] } },
  });
  const byBatch = new Map();
  for (const m of movements) {
    if (!m.batchId) continue;
    const entry = byBatch.get(m.batchId) || { productId: m.productId, batchId: m.batchId, quantity: 0 };
    entry.quantity = round3(entry.quantity + m.quantity);
    byBatch.set(m.batchId, entry);
  }
  return [...byBatch.values()];
}

// devolve ao estoque tudo que o atendimento ainda tem consumido (no-op se não há nada)
export async function revertAppointmentConsumption(tx, { appointmentId, staffId, reason }) {
  const consumed = (await netConsumptionByBatch(tx, appointmentId)).filter((e) => e.quantity < -CONSUMPTION_EPS);
  const perProduct = new Map();

  for (const e of consumed) {
    const amount = -e.quantity;
    await tx.stockBatch.update({ where: { id: e.batchId }, data: { quantity: { increment: amount } } });
    await tx.stockMovement.create({
      data: { type: "Return", productId: e.productId, batchId: e.batchId, appointmentId, staffId, quantity: amount, reason },
    });
    perProduct.set(e.productId, round3((perProduct.get(e.productId) || 0) + amount));
  }
  for (const [productId, amount] of perProduct) {
    await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: amount } } });
  }
  return consumed.length > 0;
}

// aplica a receita no estoque. Devolve a lista de avisos de falta.
async function consumeRecipe(tx, { appointment, recipe, staffId }) {
  const warnings = [];
  const now = new Date();
  // data em que um frasco novo é considerado aberto: a do atendimento (se já passou)
  const openedAt = new Date(Math.min(now.getTime(), new Date(appointment.date).getTime()));

  for (const item of recipe) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) continue;

    const needed = round3(item.quantity);
    let remaining = needed;
    let consumedTotal = 0;

    const batches = await tx.stockBatch.findMany({ where: { productId: product.id, quantity: { gt: 0 } } });
    const usable = sortForConsumption(batches.filter((b) => isUsableForConsumption(b, product, now)));

    for (const b of usable) {
      if (remaining <= 0) break;
      const take = round3(Math.min(b.quantity, remaining));
      if (take <= 0) continue;

      await decrementBatch(tx, b, take, product);
      if (product.trackOpening && !b.openedAt) {
        await tx.stockBatch.update({ where: { id: b.id }, data: { openedAt } });
      }
      await tx.stockMovement.create({
        data: {
          type: "Consumption",
          productId: product.id,
          batchId: b.id,
          appointmentId: appointment.id,
          staffId,
          quantity: -take,
          reason: `Atendimento: ${appointment.title}`,
        },
      });
      remaining = round3(remaining - take);
      consumedTotal = round3(consumedTotal + take);
    }

    if (consumedTotal > 0) {
      await tx.product.update({ where: { id: product.id }, data: { currentStock: { increment: -consumedTotal } } });
    }
    if (remaining > CONSUMPTION_EPS) {
      warnings.push({
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        needed,
        missing: remaining,
      });
    }
  }
  return warnings;
}

// Chamar DENTRO da transação que atualiza o atendimento.
// `before` = atendimento antes da mudança, `after` = depois (com status e serviceId).
export async function syncAppointmentStock(tx, { before, after, staffId }) {
  const wasCompleted = before?.status === "Completed";
  const isCompleted = after.status === "Completed";
  const serviceChanged = (before?.serviceId ?? null) !== (after.serviceId ?? null);

  // nada relevante mudou: não mexe no estoque (garante a idempotência)
  if (wasCompleted === isCompleted && !(isCompleted && serviceChanged)) return { warnings: [], changed: false };

  const reverted = await revertAppointmentConsumption(tx, {
    appointmentId: after.id,
    staffId,
    reason: isCompleted ? "Estorno: procedimento do atendimento alterado" : `Estorno: atendimento deixou de estar concluído (${after.status})`,
  });
  if (!isCompleted || !after.serviceId) return { warnings: [], changed: reverted };

  const recipe = await tx.recipeItem.findMany({ where: { serviceId: after.serviceId } });
  if (recipe.length === 0) return { warnings: [], changed: reverted };

  const warnings = await consumeRecipe(tx, { appointment: after, recipe, staffId });
  return { warnings, changed: true };
}

//------------------------------------------------------------- helpers de receita
export async function loadRecipe(serviceId) {
  const items = await prisma.recipeItem.findMany({ where: { serviceId } });
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const rows = items.map((i) => {
    const p = byId.get(i.productId);
    return {
      id: i.id,
      productId: i.productId,
      quantity: i.quantity,
      product: p
        ? { id: p.id, name: p.name, unit: p.unit, currentStock: p.currentStock, lastCost: p.lastCost, active: p.active }
        : null,
    };
  });
  return { serviceId, items: rows, ...recipeCost(rows) };
}

// custo estimado por execução = soma(quantidade x último custo por unidade base)
export function recipeCost(rows) {
  let cost = 0;
  let complete = rows.length > 0;
  for (const r of rows) {
    const unitCost = r.product?.lastCost;
    if (unitCost == null) complete = false;
    else cost += r.quantity * unitCost;
  }
  return { cost: rows.length ? Math.round(cost * 100) / 100 : null, costComplete: complete };
}
