import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, STAFF_ROLES } from '../lib/permissions.js';
import { requireAdmin, stockAuth } from '../middleware/auth.js';

const router = Router();

// "Farmacêutica(o)" -> "farmaceutica-o"
const slugify = (text) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

//------------------------------------------------------------- GET ROUTE (lista profissões - toda a equipe vê as ativas)
router.get('/professions', ...stockAuth, async (req, res) => {
  try {
    const all = req.staff.role === "Admin" && req.query.includeInactive === "true";
    const professions = await prisma.profession.findMany({
      where: all ? undefined : { active: true },
      orderBy: { name: 'asc' },
    });
    res.json(professions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar profissões." });
  }
});

//------------------------------------------------------------- GET ROUTE (catálogo de permissões - só Admin, alimenta o modal de edição)
router.get('/permissions/catalog', ...stockAuth, requireAdmin, (req, res) => {
  res.json({
    roles: STAFF_ROLES,
    permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })),
    roleDefaults: ROLE_DEFAULT_PERMISSIONS,
  });
});

//------------------------------------------------------------- POST ROUTE (Admin cria profissão)
router.post('/professions', ...stockAuth, requireAdmin, async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: "Informe o nome da profissão." });

    const slug = slugify(name);
    if (!slug) return res.status(400).json({ error: "Nome inválido." });

    const profession = await prisma.profession.create({ data: { name, slug } });
    res.status(201).json(profession);
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe uma profissão com esse nome." });
    console.error(error);
    res.status(500).json({ error: "Erro ao criar profissão." });
  }
});

//------------------------------------------------------------- PUT ROUTE (Admin renomeia/ativa/desativa; o slug nunca muda)
router.put('/professions/:id', ...stockAuth, requireAdmin, async (req, res) => {
  try {
    const data = {};
    if (req.body.name !== undefined) {
      const name = req.body.name?.trim();
      if (!name) return res.status(400).json({ error: "Informe o nome da profissão." });
      data.name = name;
    }
    if (req.body.active !== undefined) data.active = !!req.body.active;

    const profession = await prisma.profession.update({ where: { id: req.params.id }, data });
    res.json(profession);
  } catch (error) {
    if (error.code === "P2025" || error.code === "P2023") return res.status(404).json({ error: "Profissão não encontrada." });
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe uma profissão com esse nome." });
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar profissão." });
  }
});

//------------------------------------------------------------- DELETE ROUTE (Admin; só se ninguém usa - senão desative)
router.delete('/professions/:id', ...stockAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [staffCount, productCount] = await Promise.all([
      prisma.staff.count({ where: { professionId: id } }),
      prisma.product.count({ where: { allowedProfessionIds: { has: id } } }),
    ]);
    if (staffCount > 0 || productCount > 0) {
      return res.status(409).json({
        error: `Esta profissão está em uso (${staffCount} funcionário(s), ${productCount} produto(s)). Desative-a em vez de excluir.`,
      });
    }
    await prisma.profession.delete({ where: { id } });
    res.json({ message: "Profissão removida." });
  } catch (error) {
    if (error.code === "P2025" || error.code === "P2023") return res.status(404).json({ error: "Profissão não encontrada." });
    console.error(error);
    res.status(500).json({ error: "Erro ao remover profissão." });
  }
});

export default router;
