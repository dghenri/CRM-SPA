import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { toPublicUser } from '../lib/serializers.js';
import { authenticateToken, requireStaff, requireUser } from '../middleware/auth.js';

const router = Router();

const isObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id));

//=============================================================== CUPONS (COUPONS)

// Calcula o status "visual" do cupom (usado pelas abas do painel: Todos,
// Ativos, Agendados, Expirados, Arquivados) a partir dos campos reais do
// banco, em vez de guardar um status redundante que poderia ficar
// desatualizado.
function getCouponStatus(coupon, now = new Date()) {
  if (coupon.archivedAt) return "archived";
  if (coupon.expiresAt && coupon.expiresAt <= now) return "expired";
  if (coupon.startsAt && coupon.startsAt > now) return "scheduled";
  return "active";
}

function serializeCoupon(coupon) {
  return { ...coupon, status: getCouponStatus(coupon) };
}

// confere se o cupom vale pra essa compra específica (applicable_to). Usado
// tanto na pré-validação do bookingflow (/coupons/validate) quanto na hora
// de aplicar de fato (/coupons/apply), pra manter as duas em sincronia.
async function checkCouponScope(coupon, { userId, serviceId }) {
  if (coupon.scope === "SpecificServices" && (!serviceId || !coupon.serviceIds.includes(serviceId))) {
    return "Este cupom não é válido para o serviço selecionado.";
  }

  if (coupon.scope === "Category") {
    const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;
    if (!service || service.category !== coupon.category) {
      return "Este cupom não é válido para essa categoria de serviço.";
    }
  }

  if (coupon.scope === "FirstPurchase") {
    const priorAppointments = await prisma.appointment.count({
      where: { customerId: userId, status: "Completed" },
    });
    if (priorAppointments > 0) {
      return "Este cupom vale só na primeira compra.";
    }
  }

  return null;
}

function computeCouponDiscount(coupon, purchaseAmount) {
  const amount = Number(purchaseAmount) || 0;
  let discountAmount = coupon.discountType === "Percentage"
    ? (amount * coupon.discountValue) / 100
    : coupon.discountValue;
  if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  // o desconto nunca passa do valor da compra
  return Math.max(0, Math.min(discountAmount, amount));
}

//------------------------------------------------------------- POST ROUTE (equipe cria um cupom)
router.post('/coupons', authenticateToken, requireStaff, async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue,
      minPurchase, maxDiscount, startsAt, expiresAt,
      usageLimit, perUserLimit, userId,
      scope, serviceIds, category,
    } = req.body;

    if (!code?.trim() || !discountType || discountValue === undefined) {
      return res.status(400).json({ error: "Preencha código, tipo e valor do desconto." });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.trim().toUpperCase(),
        description: description?.trim() || undefined,
        discountType,
        discountValue: Number(discountValue),
        minPurchase: minPurchase !== undefined && minPurchase !== "" ? Number(minPurchase) : undefined,
        maxDiscount: maxDiscount !== undefined && maxDiscount !== "" ? Number(maxDiscount) : undefined,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        usageLimit: usageLimit !== undefined && usageLimit !== "" ? Number(usageLimit) : undefined,
        perUserLimit: perUserLimit !== undefined && perUserLimit !== "" ? Number(perUserLimit) : undefined,
        // applicable_to: pra que o cupom vale (todos os serviços, específicos, categoria, 1ª compra ou 1 cliente)
        scope: scope || "AllServices",
        category: scope === "Category" ? category?.trim() : undefined,
        serviceIds: scope === "SpecificServices" && Array.isArray(serviceIds) ? serviceIds : [],
        userId: (scope === "SpecificCustomer" && userId) ? userId : undefined,
      },
    });

    res.status(201).json(serializeCoupon(coupon));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Já existe um cupom com esse código." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao criar cupom." });
  }
});

//------------------------------------------------------------- PUT ROUTE (equipe edita um cupom existente)
router.put('/coupons/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue,
      minPurchase, maxDiscount, startsAt, expiresAt,
      usageLimit, perUserLimit, userId,
      scope, serviceIds, category, archivedAt,
    } = req.body;

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        code: code ? code.trim().toUpperCase() : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        discountType,
        discountValue: discountValue !== undefined ? Number(discountValue) : undefined,
        minPurchase: minPurchase !== undefined ? (minPurchase === "" ? null : Number(minPurchase)) : undefined,
        maxDiscount: maxDiscount !== undefined ? (maxDiscount === "" ? null : Number(maxDiscount)) : undefined,
        startsAt: startsAt !== undefined ? (startsAt ? new Date(startsAt) : null) : undefined,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
        usageLimit: usageLimit !== undefined ? (usageLimit === "" ? null : Number(usageLimit)) : undefined,
        perUserLimit: perUserLimit !== undefined ? (perUserLimit === "" ? null : Number(perUserLimit)) : undefined,
        // arquivar/desarquivar junto com a edição (mesmo campo da rota PATCH /:id/archive)
        archivedAt: archivedAt !== undefined ? (archivedAt ? new Date(archivedAt) : null) : undefined,
        // applicable_to: reconecta do zero pra refletir o escopo escolhido na edição
        scope,
        category: scope !== undefined ? (scope === "Category" ? category?.trim() || null : null) : undefined,
        serviceIds: scope !== undefined
          ? (scope === "SpecificServices" && Array.isArray(serviceIds) ? serviceIds : [])
          : undefined,
        userId: scope !== undefined
          ? (scope === "SpecificCustomer" && userId ? userId : null)
          : (userId !== undefined ? (userId || null) : undefined),
      },
    });

    res.status(200).json(serializeCoupon(coupon));
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Já existe um cupom com esse código." });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao editar cupom." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (arquivar / desarquivar um cupom)
router.patch('/coupons/:id/archive', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { archived } = req.body; // true = arquivar, false = desarquivar

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: { archivedAt: archived === false ? null : new Date() },
    });

    res.status(200).json(serializeCoupon(coupon));
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao arquivar cupom." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (equipe apaga um cupom definitivamente)
router.delete('/coupons/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: "Cupom removido com sucesso." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    // P2003/P2014: já existe resgate (CouponRedemption) referenciando esse
    // cupom - o Prisma bloqueia a exclusão pra não deixar histórico órfão.
    if (error.code === "P2003" || error.code === "P2014") {
      return res.status(409).json({
        error: "Esse cupom já foi resgatado por algum cliente, então não pode ser excluído (isso apagaria o histórico de uso dele). Arquive o cupom em vez de excluir.",
      });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover cupom." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe lista todos os cupons, com filtro opcional por status/cliente)
router.get('/coupons', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { userId, status } = req.query;

    const coupons = await prisma.coupon.findMany({
      where: { userId: userId || undefined },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    const withStatus = coupons.map((c) => ({
      ...serializeCoupon(c),
      user: toPublicUser(c.user),
    }));

    res.json(status ? withStatus.filter((c) => c.status === status) : withStatus);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cupons." });
  }
});

//------------------------------------------------------------- GET ROUTE (cupons visíveis pro cliente logado: gerais + exclusivos dele, com status calculado)
router.get('/coupons/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const now = new Date();

    // ids de todo cupom que esse cliente já resgatou (claim ou uso, tanto faz)
    const myRedemptions = await prisma.couponRedemption.findMany({
      where: { userId: req.user.id },
      select: { couponId: true },
    });
    const claimedIds = [...new Set(myRedemptions.map((r) => r.couponId))];

    // só entram aqui cupons pessoais (userId = eu) ou que eu já resgatei pra
    // carteira em algum momento — um cupom público não some do banco, mas só
    // aparece pro cliente depois que ele digita o código em "Resgatar"
    // busca em duas partes bem simples e junta em JS. O filtro de arquivado
    // é aplicado aqui em JS também: o Prisma/Mongo não está resolvendo
    // "archivedAt: null" corretamente no where (bug conhecido do conector
    // Mongo pra campos DateTime opcionais), então filtramos depois de buscar.
    const [personalCoupons, claimedCoupons] = await Promise.all([
      prisma.coupon.findMany({ where: { userId: req.user.id } }),
      prisma.coupon.findMany({ where: { id: { in: claimedIds } } }),
    ]);

    const couponsById = new Map();
    for (const c of [...personalCoupons, ...claimedCoupons]) {
      if (!c.archivedAt) couponsById.set(c.id, c);
    }
    const coupons = [...couponsById.values()].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // conta, pra cada cupom, quantas vezes ESSE cliente já USOU de fato
    // (usedAt preenchido) — resgate/claim sozinho não consome o limite.
    // Filtramos "usedAt não nulo" em JS pelo mesmo motivo do archivedAt acima.
    const myRedemptionsForCoupons = await prisma.couponRedemption.findMany({
      where: { userId: req.user.id, couponId: { in: coupons.map((c) => c.id) } },
    });
    const usageByCoupon = {};
    // resgates na carteira que ainda NÃO foram usados - é o que o bookingflow
    // precisa para saber se o cliente ainda pode aplicar o cupom
    const availableByCoupon = {};
    for (const r of myRedemptionsForCoupons) {
      if (r.usedAt) usageByCoupon[r.couponId] = (usageByCoupon[r.couponId] ?? 0) + 1;
      else availableByCoupon[r.couponId] = (availableByCoupon[r.couponId] ?? 0) + 1;
    }

    const withStatus = coupons.map((c) => ({
      ...c,
      status: getCouponStatus(c, now),
      myUsageCount: usageByCoupon[c.id] ?? 0,
      myAvailableCount: availableByCoupon[c.id] ?? 0,
    }));

    res.json(withStatus);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cupons." });
  }
});

//------------------------------------------------------------- GET ROUTE (histórico de cupons já usados pelo cliente logado)
router.get('/coupons/me/redemptions', authenticateToken, requireUser, async (req, res) => {
  try {
    const allRedemptions = await prisma.couponRedemption.findMany({
      where: { userId: req.user.id },
      include: { coupon: true },
    });

    const redemptions = allRedemptions
      .filter((r) => r.usedAt)
      .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));

    res.json(redemptions.map((r) => ({ ...r, coupon: serializeCoupon(r.coupon) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar cupons usados." });
  }
});

//------------------------------------------------------------- POST ROUTE (cliente resgata um cupom pelo código - só adiciona à carteira, não consome uso)
router.post('/coupons/redeem', authenticateToken, requireUser, async (req, res) => {
  try {
    const { code } = req.body;

    const coupon = await prisma.coupon.findUnique({ where: { code: code?.trim().toUpperCase() } });

    if (!coupon || (coupon.userId && coupon.userId !== req.user.id)) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }

    if (getCouponStatus(coupon) !== "active") {
      return res.status(400).json({ error: "Este cupom não está disponível para uso." });
    }

    if (coupon.perUserLimit) {
      const timesClaimedByUser = await prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId: req.user.id },
      });
      if (timesClaimedByUser >= coupon.perUserLimit) {
        return res.status(400).json({ error: "Você já atingiu o limite de uso deste cupom." });
      }
    }

    // "resgatar" só guarda o cupom na carteira do cliente (usedAt fica vazio).
    // Ele só entra pro limite global de usos e vira "usado" quando é de fato
    // aplicado num agendamento, através de /coupons/apply.
    const redemption = await prisma.couponRedemption.create({
      data: {
        coupon: { connect: { id: coupon.id } },
        user: { connect: { id: req.user.id } },
      },
      include: { coupon: true },
    });

    res.status(200).json(redemption);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao resgatar cupom." });
  }
});

//------------------------------------------------------------- POST ROUTE (pré-valida um cupom já resgatado contra o serviço escolhido no bookingflow, sem consumir)
router.post('/coupons/validate', authenticateToken, requireUser, async (req, res) => {
  try {
    const { code, serviceId } = req.body;

    // o valor da compra é SEMPRE o preço real do serviço no banco - o que o front
    // enviar como `purchaseAmount` é ignorado (a API aceita qualquer requisição forjada)
    const service = isObjectId(serviceId) ? await prisma.service.findUnique({ where: { id: String(serviceId) } }) : null;
    if (!service) return res.status(400).json({ error: "Selecione um procedimento válido." });
    const purchaseAmount = service.price;

    const coupon = await prisma.coupon.findUnique({ where: { code: code?.trim().toUpperCase() } });
    if (!coupon || (coupon.userId && coupon.userId !== req.user.id)) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }

    // precisa ter sido resgatado antes (carteira) e ainda não ter sido aplicado
    const myRedemptionsForCoupon = await prisma.couponRedemption.findMany({
      where: { couponId: coupon.id, userId: req.user.id },
    });
    const redemption = myRedemptionsForCoupon
      .filter((r) => !r.usedAt)
      .sort((a, b) => new Date(a.claimedAt) - new Date(b.claimedAt))[0];
    if (!redemption) {
      return res.status(400).json({ error: "Resgate este cupom na aba Cupons antes de usá-lo." });
    }

    if (getCouponStatus(coupon) !== "active") {
      return res.status(400).json({ error: "Este cupom não está mais disponível." });
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ error: "Este cupom atingiu o limite de usos." });
    }

    const scopeError = await checkCouponScope(coupon, { userId: req.user.id, serviceId });
    if (scopeError) return res.status(400).json({ error: scopeError });

    if (coupon.minPurchase && (!purchaseAmount || purchaseAmount < coupon.minPurchase)) {
      return res.status(400).json({ error: `Valor mínimo de R$ ${coupon.minPurchase.toFixed(2)} para usar este cupom.` });
    }

    res.json({
      redemptionId: redemption.id,
      coupon,
      discountAmount: computeCouponDiscount(coupon, purchaseAmount),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao validar cupom." });
  }
});

//------------------------------------------------------------- POST ROUTE (aplica de fato um cupom já resgatado a um agendamento - só aqui conta como usado)
router.post('/coupons/apply', authenticateToken, requireUser, async (req, res) => {
  try {
    const { redemptionId, appointmentId } = req.body;

    if (!isObjectId(redemptionId) || !isObjectId(appointmentId)) {
      return res.status(400).json({ error: "Informe o cupom resgatado e o agendamento." });
    }

    // o serviço e o valor da compra vêm do AGENDAMENTO (que precisa ser do próprio cliente),
    // nunca do que o front enviar - assim ninguém infla o valor nem usa o cupom em sessão alheia
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { service: true } });
    if (!appointment || appointment.customerId !== req.user.id || !appointment.service) {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    const serviceId = appointment.serviceId;
    const purchaseAmount = appointment.service.price;

    // um cupom por agendamento
    const alreadyApplied = await prisma.couponRedemption.findMany({ where: { appointmentId } });
    if (alreadyApplied.some((r) => r.usedAt)) {
      return res.status(400).json({ error: "Este agendamento já tem um cupom aplicado." });
    }

    const redemption = await prisma.couponRedemption.findUnique({
      where: { id: redemptionId },
      include: { coupon: true },
    });

    if (!redemption || redemption.userId !== req.user.id) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
    if (redemption.usedAt) {
      return res.status(400).json({ error: "Este cupom já foi utilizado." });
    }

    const { coupon } = redemption;

    if (getCouponStatus(coupon) !== "active") {
      return res.status(400).json({ error: "Este cupom não está mais disponível." });
    }
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ error: "Este cupom atingiu o limite de usos." });
    }

    const scopeError = await checkCouponScope(coupon, { userId: req.user.id, serviceId });
    if (scopeError) return res.status(400).json({ error: scopeError });

    if (coupon.minPurchase && (!purchaseAmount || purchaseAmount < coupon.minPurchase)) {
      return res.status(400).json({ error: `Valor mínimo de R$ ${coupon.minPurchase.toFixed(2)} para usar este cupom.` });
    }

    const discountAmount = computeCouponDiscount(coupon, purchaseAmount);

    const [, updatedRedemption] = await prisma.$transaction([
      prisma.coupon.update({
        where: { id: coupon.id },
        data: { usageCount: { increment: 1 } },
      }),
      prisma.couponRedemption.update({
        where: { id: redemption.id },
        data: {
          usedAt: new Date(),
          discountAmount,
          appointment: appointmentId ? { connect: { id: appointmentId } } : undefined,
        },
        include: { coupon: true },
      }),
    ]);

    res.status(200).json(updatedRedemption);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao aplicar cupom." });
  }
});

export default router;
