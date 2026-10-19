import { prisma } from './prisma.js';

// "Sair de outros dispositivos": cada conta (User/Staff) tem `sessionsValidFrom`.
// Token emitido (iat) ANTES desse instante deixa de valer. iat é em segundos, por isso
// a comparação é feita em segundos (um token emitido no mesmo segundo ainda passa).
//
// `decoded` = payload do JWT já verificado ({ id, type: "staff" | "user", iat, ... }).
export async function isSessionRevoked(decoded) {
  if (!decoded?.id || !decoded?.iat) return false;
  const model = decoded.type === 'staff' ? prisma.staff : prisma.user;
  const account = await model.findUnique({ where: { id: decoded.id }, select: { sessionsValidFrom: true } });
  if (!account) return true; // conta removida
  if (!account.sessionsValidFrom) return false;
  return decoded.iat < Math.floor(account.sessionsValidFrom.getTime() / 1000);
}
