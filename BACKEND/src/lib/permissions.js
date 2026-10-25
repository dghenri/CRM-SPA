// Cargos (nível de acesso) e permissões do staff.
//
// - O CARGO (Admin / Manager / Employee) define o conjunto padrão de permissões.
// - O Admin pode personalizar as permissões de um funcionário (Staff.customPermissions = true
//   + Staff.permissions = lista de chaves); aí a lista do funcionário vale no lugar do padrão do cargo.
// - O Admin SEMPRE tem todas as permissões e isso não é configurável.
// - Gerenciar equipe (criar/editar/excluir funcionários) e profissões é exclusivo do Admin
//   e NÃO é delegável (evita escalada de privilégio): essas rotas usam requireAdmin.

export const ADMIN_ROLE = "Admin";
export const STAFF_ROLES = ["Admin", "Manager", "Employee"];

// chave -> descrição (a tela de edição do funcionário lista essas opções)
export const PERMISSIONS = {
  "overview.view": "Ver o Overview (painel geral, gráficos, cupons e melhores clientes)",
  "appointments.viewAll": "Ver e gerenciar os agendamentos de toda a clínica, a receita completa, e escolher o profissional responsável por sessões e procedimentos",
  "services.manage": "Excluir procedimentos",
  "products.manage": "Cadastrar e editar produtos do estoque",
  "recipes.manage": "Ver e editar receitas (insumos de cada procedimento)",
  "stock.review": "Aprovar/negar solicitações de estoque, aplicar movimentações direto e ver o histórico",
  "customers.manage": "Editar e excluir clientes",
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS);

// padrão de cada cargo (Admin é tratado à parte: sempre tudo)
export const ROLE_DEFAULT_PERMISSIONS = {
  Admin: PERMISSION_KEYS,
  Manager: PERMISSION_KEYS.filter((k) => k !== "customers.manage"),
  Employee: [],
};

// lista final de permissões de um staff (precisa do registro com role / customPermissions / permissions)
export function getEffectivePermissions(staff) {
  if (!staff) return [];
  if (staff.role === ADMIN_ROLE) return [...PERMISSION_KEYS];
  if (staff.customPermissions === true) {
    return (staff.permissions || []).filter((k) => PERMISSION_KEYS.includes(k));
  }
  return [...(ROLE_DEFAULT_PERMISSIONS[staff.role] || [])];
}

export function hasPermission(staff, key) {
  return getEffectivePermissions(staff).includes(key);
}
