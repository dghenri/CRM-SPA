import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { broadcastAppointmentsChanged, broadcastStockChanged } from '../lib/realtime.js';
import { isPaymentMethod } from '../lib/payments.js';
import { toPublicUser } from '../lib/serializers.js';
import { authenticateToken, requireStaff, requireUser } from '../middleware/auth.js';
import { revertAppointmentConsumption, syncAppointmentStock } from '../services/recipes.js';
import { StockError } from '../services/stock.js';

const router = Router();

//=============================================================== AGENDAMENTOS (APPOINTMENTS)

// Código de 6 letras mostrado ao cliente (diferente do `id`, que é o
// ObjectId interno do Mongo). Tenta criar o agendamento algumas vezes,
// sorteando um novo código a cada colisão, pra cobrir o caso raro de dois
// clientes caírem no mesmo código ao mesmo tempo.
const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_PATTERN = /^[A-Z]{6}$/;

function generateAppointmentCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  }
  return code;
}

async function createAppointmentWithUniqueCode(data, preferredCode, options, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    // usa o código sugerido pelo front só na primeira tentativa - se colidir,
    // as tentativas seguintes sempre sorteiam um novo
    const code = i === 0 && CODE_PATTERN.test(preferredCode) ? preferredCode : generateAppointmentCode();

    try {
      return await prisma.appointment.create({
        data: { ...data, code },
        ...options,
      });
    } catch (error) {
      const isCodeCollision = error.code === "P2002" && error.meta?.target?.includes("code");
      if (!isCodeCollision || i === attempts - 1) throw error;
      // colisão no `code` - tenta de novo com outro código sorteado
    }
  }
}

//------------------------------------------------------------- POST ROUTE (cria um agendamento)
// - Cliente logado: só pode criar agendamento pra si mesmo, vinculado a um serviço.
// - Equipe logada: pode criar pra qualquer cliente (ou sem cliente/serviço vinculado -
//   ex: evento avulso na agenda), com título e cor personalizados.
router.post('/appointments', authenticateToken, async (req, res) => {
  try {
    const { title, date, endDate, color, notes, serviceId, customerId, professionalId, code, paymentMethod } = req.body;

    if (!date || !endDate) {
      return res.status(400).json({ error: "Informe a data de início e término." });
    }

    let service = null;
    if (serviceId) {
      service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        return res.status(400).json({ error: "Serviço não encontrado." });
      }
    }

    // forma de pagamento: obrigatória pro cliente, opcional pra equipe (evento avulso)
    if (paymentMethod != null && paymentMethod !== "" && !isPaymentMethod(paymentMethod)) {
      return res.status(400).json({ error: "Forma de pagamento inválida." });
    }
    if (req.user.type === "user" && !paymentMethod) {
      return res.status(400).json({ error: "Escolha a forma de pagamento." });
    }

    const data = {
      title: (title?.trim() || service?.title || "Sem título"),
      date: new Date(date),
      endDate: new Date(endDate),
      color: color || "blue",
      notes,
      paymentMethod: paymentMethod || null,
    };

    if (serviceId) data.service = { connect: { id: serviceId } };

    // se não veio um profissional explícito, herda o responsável cadastrado
    // no próprio serviço (ex: Botox -> Dra. Fulana já vinculada por padrão)
    const resolvedProfessionalId = professionalId || service?.professionalId || null;
    if (resolvedProfessionalId) data.professional = { connect: { id: resolvedProfessionalId } };

    if (req.user.type === "user") {
      if (!serviceId || !service.available) {
        return res.status(400).json({ error: "Selecione um serviço disponível." });
      }
      data.customer = { connect: { id: req.user.id } };
    } else {
      // equipe: cliente é opcional (evento avulso na agenda)
      if (customerId) data.customer = { connect: { id: customerId } };
    }

    const appointment = await createAppointmentWithUniqueCode(data, code, {
      include: { service: true, customer: true, professional: { select: { id: true, name: true } } },
    });

    broadcastAppointmentsChanged();
    res.status(201).json({ ...appointment, customer: toPublicUser(appointment.customer) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar agendamento." });
  }
});

const APPOINTMENT_STATUSES = ["Scheduled", "Confirmed", "Completed", "Cancelled", "NoShow"];
const APPOINTMENT_INCLUDE = { service: true, customer: true, professional: { select: { id: true, name: true } } };

//------------------------------------------------------------- PUT ROUTE (equipe edita um agendamento completo)
router.put('/appointments/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { title, date, endDate, color, notes, status, serviceId, customerId, professionalId, paymentMethod } = req.body;

    if (status !== undefined && !APPOINTMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    if (paymentMethod != null && paymentMethod !== "" && !isPaymentMethod(paymentMethod)) {
      return res.status(400).json({ error: "Forma de pagamento inválida." });
    }

    const data = {};
    if (title !== undefined) data.title = title.trim() || "Sem título";
    if (date !== undefined) data.date = new Date(date);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (color !== undefined) data.color = color;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) data.status = status;
    // valor vazio ("" ou null) limpa a forma de pagamento
    if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;

    // connect/disconnect explícito: valor vazio ("" ou null) desvincula
    if (serviceId !== undefined) {
      data.service = serviceId ? { connect: { id: serviceId } } : { disconnect: true };
    }
    if (customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    if (professionalId !== undefined) {
      data.professional = professionalId ? { connect: { id: professionalId } } : { disconnect: true };
    }

    const { appointment, stock } = await prisma.$transaction(async (tx) => {
      const before = await tx.appointment.findUnique({ where: { id: req.params.id } });
      if (!before) {
        const notFound = new Error("Agendamento não encontrado.");
        notFound.code = "P2025";
        throw notFound;
      }
      const appointment = await tx.appointment.update({ where: { id: req.params.id }, data, include: APPOINTMENT_INCLUDE });
      const stock = await syncAppointmentStock(tx, { before, after: appointment, staffId: req.user.id });
      return { appointment, stock };
    });

    broadcastAppointmentsChanged();
    if (stock.changed) broadcastStockChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer), stockWarnings: stock.warnings });
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

//------------------------------------------------------------- GET ROUTE (agendamentos do cliente logado)
router.get('/appointments/me', authenticateToken, requireUser, async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { customerId: req.user.id },
      include: { service: true, professional: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });

    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar agendamentos." });
  }
});

//------------------------------------------------------------- GET ROUTE (equipe lista todos os agendamentos, com filtros opcionais)
router.get('/appointments', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { status, customerId, serviceId } = req.query;

    const appointments = await prisma.appointment.findMany({
      where: {
        status: status || undefined,
        customerId: customerId || undefined,
        serviceId: serviceId || undefined,
      },
      include: { service: true, customer: true, professional: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });

    res.json(
      appointments.map((a) => ({ ...a, customer: toPublicUser(a.customer) }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar agendamentos." });
  }
});

//------------------------------------------------------------- GET ROUTE (disponibilidade de um serviço num dia - staff ou cliente)
// Não usamos `requireStaff` aqui de propósito: o cliente logado precisa
// disso pra saber quais horários já estão ocupados ANTES de criar o
// agendamento. Por isso o retorno traz só { date, endDate } de cada
// agendamento que ocupa a janela - nunca nome, email ou id do cliente dono
// do horário, pra não vazar dado de um cliente pro outro.
router.get('/appointments/availability', authenticateToken, async (req, res) => {
  try {
    const { serviceId, from, to } = req.query;

    if (!serviceId || !from || !to) {
      return res.status(400).json({ error: "Informe serviceId, from e to." });
    }

    const rangeStart = new Date(from);
    const rangeEnd = new Date(to);

    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      return res.status(400).json({ error: "Datas inválidas." });
    }

    // qualquer status diferente de "Cancelled" ocupa o horário - um
    // agendamento recém-criado nasce como "Scheduled" (não "Confirmed"),
    // e ainda assim precisa bloquear o slot pra outros clientes
    const busyAppointments = await prisma.appointment.findMany({
      where: {
        serviceId,
        status: { not: "Cancelled" },
        // overlap: começa antes do fim da janela E termina depois do início dela
        date: { lt: rangeEnd },
        endDate: { gt: rangeStart },
      },
      select: { date: true, endDate: true },
    });

    res.json(busyAppointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao verificar disponibilidade." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (equipe atualiza só o status de um agendamento)
router.patch('/appointments/:id/status', authenticateToken, requireStaff, async (req, res) => {
  try {
    const { status } = req.body;
    if (!APPOINTMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }

    const { appointment, stock } = await prisma.$transaction(async (tx) => {
      const before = await tx.appointment.findUnique({ where: { id: req.params.id } });
      if (!before) {
        const notFound = new Error("Agendamento não encontrado.");
        notFound.code = "P2025";
        throw notFound;
      }
      const appointment = await tx.appointment.update({ where: { id: req.params.id }, data: { status }, include: APPOINTMENT_INCLUDE });
      const stock = await syncAppointmentStock(tx, { before, after: appointment, staffId: req.user.id });
      return { appointment, stock };
    });

    broadcastAppointmentsChanged();
    if (stock.changed) broadcastStockChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer), stockWarnings: stock.warnings });
  } catch (error) {
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (cancelar agendamento - dono ou equipe)
router.delete('/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }

    const isOwner = req.user.type === "user" && req.user.id === appointment.customerId;
    const isStaff = req.user.type === "staff";

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "Você não pode cancelar este agendamento." });
    }

    // atendimento concluído já consumiu insumos: só a equipe pode removê-lo (o estorno é registrado em nome dela)
    if (appointment.status === "Completed" && !isStaff) {
      return res.status(403).json({ error: "Atendimentos concluídos não podem ser removidos." });
    }

    const reverted = await prisma.$transaction(async (tx) => {
      // devolve ao estoque o que o atendimento consumiu, ANTES de apagá-lo
      const reverted = isStaff
        ? await revertAppointmentConsumption(tx, {
            appointmentId: appointment.id,
            staffId: appointment.professionalId || req.user.id, // responsável = quem faz o procedimento
            reason: "Estorno: atendimento excluído",
          })
        : false;
      await tx.appointment.delete({ where: { id: req.params.id } });
      return reverted;
    });

    broadcastAppointmentsChanged();
    if (reverted) broadcastStockChanged();
    res.status(200).json({ message: "Agendamento cancelado com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao cancelar agendamento." });
  }
});


//=============================================================== INICIAR ATENDIMENTO (HOME DO STAFF)
//
// Regras:
// - Só o clique do profissional inicia o atendimento: `startedAt` = agora.
//   Nada começa sozinho pelo relógio.
// - Só dá para iniciar (ou desfazer o início) enquanto o status é Scheduled ou
//   Confirmed. Iniciar um "Agendado" também o marca como "Confirmed" (o cliente
//   está ali). Finalizar/Não compareceu continuam pelo PUT/PATCH de status.
// - Iniciar duas vezes não muda a hora do primeiro início.
// - Body { started: false } desfaz o início (volta a "atrasada" se o horário passou).
router.post('/appointments/:id/start', authenticateToken, requireStaff, async (req, res) => {
  try {
    const started = req.body?.started !== false;

    const current = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    if (current.status !== "Scheduled" && current.status !== "Confirmed") {
      return res.status(400).json({ error: "Só dá para iniciar atendimentos agendados ou confirmados." });
    }

    const data = started
      ? { startedAt: current.startedAt ?? new Date(), status: "Confirmed" }
      : { startedAt: null };

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data,
      include: APPOINTMENT_INCLUDE,
    });

    broadcastAppointmentsChanged();
    res.status(200).json({ ...appointment, customer: toPublicUser(appointment.customer) });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao iniciar atendimento." });
  }
});

export default router;
