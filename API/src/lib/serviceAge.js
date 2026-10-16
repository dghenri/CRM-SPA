//=============================================================== IDADE MÍNIMA POR PROCEDIMENTO
// Service.minAge: idade mínima (em anos) para o CLIENTE agendar aquele procedimento.
// null/ausente = sem restrição extra (vale só a idade mínima geral da conta, MIN_AGE).

// Idade completa em anos na data `ref`. A data de nascimento é salva como
// meia-noite UTC do dia escolhido, então lê as partes em UTC pra não "voltar um dia".
export function ageFromBirthdate(birthdate, ref = new Date()) {
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  let age = ref.getFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    ref.getMonth() < b.getUTCMonth() ||
    (ref.getMonth() === b.getUTCMonth() && ref.getDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Valida o campo `minAge` vindo do body.
// - { skip: true }  -> campo não enviado (PATCH não mexe)
// - { value }       -> número inteiro 1..120, ou null (sem restrição; 0 e vazio viram null)
// - { error }       -> mensagem de erro pra devolver em 400
export function parseMinAge(raw) {
  if (raw === undefined) return { skip: true };
  if (raw === null || raw === "") return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 120) {
    return { error: "A idade mínima deve ser um número inteiro entre 0 e 120." };
  }
  return { value: n === 0 ? null : n };
}

// A idade do cliente atende à idade mínima do procedimento?
// Devolve null se estiver tudo certo (ou se não há o que checar) ou o corpo do erro 403.
// `db` = prisma ou o `tx` de uma transação.
export async function checkServiceMinAge(db, serviceId, customerId) {
  if (!serviceId || !customerId) return null;
  const [service, customer] = await Promise.all([
    db.service.findUnique({ where: { id: serviceId }, select: { minAge: true } }),
    db.user.findUnique({ where: { id: customerId }, select: { birthdate: true } }),
  ]);
  if (!service?.minAge || !customer) return null;
  const age = ageFromBirthdate(customer.birthdate);
  if (age === null || age < service.minAge) {
    return {
      error: `Este procedimento é permitido a partir de ${service.minAge} anos.`,
      code: "SERVICE_MIN_AGE",
      minAge: service.minAge,
    };
  }
  return null;
}
