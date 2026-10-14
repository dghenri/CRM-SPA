import { prisma } from '../lib/prisma.js';

export const WELCOME_COUPON_CODE = "BEMVINDO30";

// Cria o cupom de boas-vindas na primeira vez que for preciso (idempotente) -
// assim não é preciso rodar seed nem cadastrá-lo à mão. Se a equipe já o criou
// no painel (mesmo código), esse cupom é reaproveitado como está.
export async function ensureWelcomeCoupon() {
  const existing = await prisma.coupon.findUnique({ where: { code: WELCOME_COUPON_CODE } });
  if (existing) return existing;

  try {
    return await prisma.coupon.create({
      data: {
        code: WELCOME_COUPON_CODE,
        description: "Boas-vindas: 30% na primeira sessão (entregue automaticamente no cadastro)",
        discountType: "Percentage",
        discountValue: 30,
        scope: "FirstPurchase", // só vale enquanto o cliente não tiver sessão concluída
        perUserLimit: 1,
      },
    });
  } catch (error) {
    // duas contas criadas ao mesmo tempo: a outra já criou, é só buscar
    if (error.code === "P2002") return prisma.coupon.findUnique({ where: { code: WELCOME_COUPON_CODE } });
    throw error;
  }
}

// Coloca o cupom na carteira do cliente (equivale a "resgatar"). Não duplica:
// se o cliente já tem (usado ou não), não faz nada.
export async function grantWelcomeCoupon(userId) {
  const coupon = await ensureWelcomeCoupon();
  if (!coupon) return null;

  const already = await prisma.couponRedemption.findMany({ where: { userId, couponId: coupon.id } });
  if (already.length > 0) return null;

  return prisma.couponRedemption.create({
    data: { coupon: { connect: { id: coupon.id } }, user: { connect: { id: userId } } },
  });
}
