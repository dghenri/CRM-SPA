// Entrega o cupom BEMVINDO30 aos clientes que JÁ existiam antes dessa
// funcionalidade (contas novas já recebem no cadastro). Só atende quem ainda
// não tem nenhum agendamento ativo/concluído e ainda não tem o cupom.
//
// Rodar uma vez, na pasta do backend:
//   node scripts/grant-welcome-coupon.js          (simula e só mostra quem receberia)
//   node scripts/grant-welcome-coupon.js --apply  (aplica)
import { prisma } from '../src/lib/prisma.js';
import { ensureWelcomeCoupon, grantWelcomeCoupon } from '../src/services/welcomeCoupon.js';

const apply = process.argv.includes('--apply');

const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
const appointments = await prisma.appointment.findMany({ select: { customerId: true, status: true } });
const withSession = new Set(appointments.filter((a) => a.status !== 'Cancelled').map((a) => a.customerId));

const coupon = apply ? await ensureWelcomeCoupon() : await prisma.coupon.findUnique({ where: { code: 'BEMVINDO30' } });
const redemptions = coupon ? await prisma.couponRedemption.findMany({ where: { couponId: coupon.id } }) : [];
const hasCoupon = new Set(redemptions.map((r) => r.userId));

const targets = users.filter((u) => !withSession.has(u.id) && !hasCoupon.has(u.id));
console.log(`${targets.length} cliente(s) sem sessão e sem o cupom:`);
for (const u of targets) {
  console.log(`- ${u.name} <${u.email}>`);
  if (apply) await grantWelcomeCoupon(u.id);
}
console.log(apply ? 'Pronto: cupons entregues.' : 'Simulação: nada foi alterado. Use --apply para entregar.');
await prisma.$disconnect();
