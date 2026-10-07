import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

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

//------------------------------------------------------------- POST ROUTE (services - protegido)
router.post('/services', authenticateToken, async (req, res) => {
  try {
    const { title, description, duration, price, image, available, professionalId } = req.body;

    if (!title?.trim() || !description?.trim() || !duration || !price) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

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
        professionalId: professionalId || null,
      },
      include: { professional: { select: { id: true, name: true } } },
    });

    res.status(201).json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar serviço." });
  }
});

//------------------------------------------------------------- PATCH ROUTE (services - protegido; edição e toggle de "available")
router.patch('/services/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, duration, price, image, available, professionalId } = req.body;

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (duration !== undefined) data.duration = Number(duration);
    if (price !== undefined) data.price = Number(price);
    if (image !== undefined) data.image = image.trim();
    if (available !== undefined) data.available = available;
    if (professionalId !== undefined) data.professionalId = professionalId || null;

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

//------------------------------------------------------------- DELETE ROUTE (services - protegido)
router.delete('/services/:id', authenticateToken, async (req, res) => {
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
