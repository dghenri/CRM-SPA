import { prisma } from './prisma.js';

//=============================================================== ACESSO A AGENDAMENTOS (POR PROFISSIONAL)
//
// Regra central de segurança da agenda:
// - MajorAdmin enxerga e gerencia TODOS os agendamentos (inclusive os sem profissional).
// - Funcionária comum só enxerga/edita/apaga/adia/inicia agendamentos em que
//   `professionalId` é o id dela.
// - Em acesso indevido a API responde 404 (e não 403), pra não revelar que o
//   agendamento existe.
//
// O cargo é SEMPRE lido do banco (não do token), pra refletir mudança de cargo
// ou conta inativada sem esperar o token expirar.

// Retorna { id, isAdmin } ou null (funcionária inexistente ou inativa).
export async function getStaffActor(staffId) {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, role: true, status: true },
  });
  if (!staff || staff.status === 'Inactive') return null;
  return { id: staff.id, isAdmin: staff.role === 'MajorAdmin' };
}

// Middleware: use DEPOIS de authenticateToken + requireStaff. Preenche req.actor.
export async function loadStaffActor(req, res, next) {
  try {
    const actor = await getStaffActor(req.user.id);
    if (!actor) return res.status(403).json({ error: 'Acesso negado.' });
    req.actor = actor;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao validar permissões.' });
  }
}

// Filtro Prisma que restringe uma consulta ao que o ator pode ver.
// Uso: prisma.appointment.findMany({ where: { ...scopeWhere(req.actor), ... } })
export const scopeWhere = (actor) => (actor.isAdmin ? {} : { professionalId: actor.id });

// O ator pode ver/editar/apagar/adiar/iniciar este agendamento?
export const canManage = (actor, appointment) =>
  Boolean(appointment) && (actor.isAdmin || appointment.professionalId === actor.id);

// Erro "não encontrado" reaproveitando o código P2025 que os catch já tratam como 404.
export function notFoundError() {
  const error = new Error('Agendamento não encontrado.');
  error.code = 'P2025';
  return error;
}
