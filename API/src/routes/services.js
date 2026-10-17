import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireMajorAdmin, requireStaff, stockAuth } from '../middleware/auth.js';
import { loadStaffActor } from '../lib/appointmentAccess.js';
import { parseMinAge } from '../lib/serviceAge.js';
import { CLINIC_TIMEZONE, getBookingSchedule } from '../lib/staffSchedule.js';

const router = Router();

//------------------------------------------------------------- GET ROUTE (services - público, usado pelo admin e pelo site do cliente)
router.get('/services', async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: { createdAt: 'asc' },
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(200).json(services);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar serviços." });
  }
});

//------------------------------------------------------------- GET ROUTE (expediente da profissional do procedimento - usado no agendamento)
// Devolve os dias/horários em que a profissional responsável atende (o front monta os
// horários sugeridos a partir disso). Só horários - nada pessoal da profissional.
router.get('/services/:id/schedule', authenticateToken, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: { professionalId: true },
    });
    if (!service) return res.status(404).json({ error: "Serviço não encontrado." });

    res.status(200).json({ ...(await getBookingSchedule(service.professionalId)), timezone: CLINIC_TIMEZONE });
  } catch (error) {
    if (error.code === "P2023") return res.status(404).json({ error: "Serviço não encontrado." }); // id inválido
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar o expediente." });
  }
});

//------------------------------------------------------------- POST ROUTE (services - só equipe)
// MajorAdmin escolhe o profissional responsável; para as demais o responsável
// é sempre a própria criadora (o professionalId do body é ignorado).
router.post('/services', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const { title, description, duration, price, image, available, professionalId } = req.body;

    if (!title?.trim() || !description?.trim() || !duration || !price) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    const minAge = parseMinAge(req.body.minAge);
    if (minAge.error) return res.status(400).json({ error: minAge.error });

    const service = await prisma.service.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        duration: Number(duration),
        price: Number(price),
        image:
          image?.trim() ||
          `https://picsum.photos/seed/${encodeURIComponent(title)}/600/450`,
        available: available ?? true,
        minAge: minAge.skip ? null : minAge.value,
        professionalId: req.actor.isAdmin ? professionalId || null : req.actor.id,
      },
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(201).json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar serviço." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (services - só equipe; edição e toggle de "available")
// MajorAdmin edita qualquer procedimento e é o único que troca o profissional responsável.
// As demais só editam os procedimentos em que são a profissional responsável.
router.patch('/services/:id', authenticateToken, requireStaff, loadStaffActor, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, duration, price, image, available, professionalId } = req.body;

    const existing = await prisma.service.findUnique({ where: { id }, select: { professionalId: true } });
    if (!existing) {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }
    if (!req.actor.isAdmin && existing.professionalId !== req.actor.id) {
      return res.status(403).json({ error: "Você só pode editar os seus procedimentos." });
    }

    const minAge = parseMinAge(req.body.minAge);
    if (minAge.error) return res.status(400).json({ error: minAge.error });

    const data = {};
    if (!minAge.skip) data.minAge = minAge.value;
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (duration !== undefined) data.duration = Number(duration);
    if (price !== undefined) data.price = Number(price);
    if (image !== undefined) data.image = image.trim();
    if (available !== undefined) data.available = available;
    if (professionalId !== undefined && req.actor.isAdmin) data.professionalId = professionalId || null;

    const service = await prisma.service.update({
      where: { id }, // ObjectId do Mongo é string, não Number
      data,
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(200).json(service);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar serviço." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (services - só MajorAdmin)
// Excluir apaga a receita de insumos e desvincula as sessões antigas do serviço.
router.delete('/services/:id', ...stockAuth, requireMajorAdmin, async (req, res) => {
  try {
    // a receita (RecipeItem) depende do serviço: sai junto com ele
    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { serviceId: req.params.id } });
      await tx.service.delete({ where: { id: req.params.id } }); // ObjectId do Mongo é string, não Number
    });

    res.status(200).json({ message: "Serviço removido com sucesso." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao remover serviço." });
  }
});

export default router;
