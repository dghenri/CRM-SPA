import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireUser } from '../middleware/auth.js';

const router = Router();

//=============================================================== FAVORITOS

//------------------------------------------------------------- GET ROUTE (lista favoritos do cliente logado)
router.get('/users/me/favorites', authenticateToken, requireUser, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { favoriteServices: true },
    });

    res.json(customer?.favoriteServices ?? []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar favoritos." });
  }
});

//------------------------------------------------------------- POST ROUTE (favoritar um serviço)
router.post('/users/me/favorites/:serviceId', authenticateToken, requireUser, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.serviceId } });
    if (!service) {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }

    const customer = await prisma.user.update({
      where: { id: req.user.id },
      data: { favoriteServices: { connect: { id: req.params.serviceId } } },
      include: { favoriteServices: true },
    });

    res.status(200).json(customer.favoriteServices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao favoritar serviço." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (desfavoritar um serviço)
router.delete('/users/me/favorites/:serviceId', authenticateToken, requireUser, async (req, res) => {
  try {
    const customer = await prisma.user.update({
      where: { id: req.user.id },
      data: { favoriteServices: { disconnect: { id: req.params.serviceId } } },
      include: { favoriteServices: true },
    });

    res.status(200).json(customer.favoriteServices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao remover favorito." });
  }
});

export default router;
