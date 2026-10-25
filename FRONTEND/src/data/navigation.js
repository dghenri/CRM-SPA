import {
  House,
  CalendarRange,
  Globe,
  MessagesSquare,
  UsersRound,
  Target,
  IdCardLanyard,
  Logs,
  Store,
  Ticket,
  ShelvingUnit,
  Receipt,
  Megaphone,
  Briefcase,
} from "lucide-react";

// Cargos existentes em prisma.Staff.role - usados pra filtrar quais itens
// de navegação cada colaborador logado enxerga na sidebar. Item sem
// "roles" definido é tratado como visível para todos os cargos (ver
// filtro em Sidebar.jsx).
//
// Um item também pode ter `permission` (ex: "overview.view"): aí só aparece pra
// quem tem essa permissão (Admin sempre tem). Se tiver `roles` E `permission`,
// precisa passar nos dois.
export const ALL_STAFF_ROLES = ["Admin", "Manager", "Employee"];
export const ADMIN_ONLY_ROLES = ["Admin"];

// Badges: cada item pode ter `badges: [{ key, tone, label }]`. `key` é o contador vindo de
// GET /staff/sidebar-badges; `tone`: accent (informativo), warning (amarelo) ou danger (vermelho);
// `label` é o texto de acessibilidade/tooltip. Zero = não aparece.

export const mainItems = [
  {
    key: "home",
    label: "Home",
    tooltip: "Home",
    Icon: House,
    to: "/staff",
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "Cronograma",
    label: "Cronograma",
    tooltip: "Cronograma",
    Icon: CalendarRange,
    to: "/staff/scheduling",
    badges: [{ key: "scheduling", tone: "accent", label: "sessões agendadas hoje" }],
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "procedimentos",
    label: "Procedimentos",
    tooltip: "Procedimentos",
    Icon: Store,
    to: "/staff/services",
    badges: [{ key: "services", tone: "accent", label: "procedimentos ativos" }],
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "cupons",
    label: "Cupons",
    tooltip: "Cupons",
    Icon: Ticket,
    to: "/staff/coupons",
    badges: [{ key: "coupons", tone: "accent", label: "cupons ativos" }],
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "estoque",
    label: "Estoque",
    tooltip: "Estoque",
    Icon: ShelvingUnit,
    to: "/staff/storage",
    badges: [{ key: "stock", tone: "accent", label: "produtos ativos" }],
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "receita",
    label: "Receita",
    tooltip: "Receita",
    Icon: Receipt,
    to: "/staff/revenue",
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "comunicação",
    label: "Comunicação",
    tooltip: "Comunicação",
    Icon: Megaphone,
    to: "/staff/communication",
    badges: [{ key: "communication", tone: "accent", label: "notificações e banners ativos" }],
    roles: ALL_STAFF_ROLES,
  },
];

export const usersItems = [
  {
    key: "employees",
    label: "Employees",
    group: "Users",
    Icon: IdCardLanyard,
    to: "/staff/employees",
    roles: ADMIN_ONLY_ROLES,
  },
  {
    key: "professions",
    label: "Professions",
    group: "Users",
    Icon: Briefcase,
    to: "/staff/professions",
    roles: ADMIN_ONLY_ROLES,
  },
  {
    key: "users",
    label: "Users",
    group:"Users",
    Icon: UsersRound,
    to: "/staff/users",
    permission: "customers.manage",
  },
];

export const managementItems = [
  {
    key: "overview",
    label: "Overview",
    tooltip: "Overview",
    Icon: Target,
    to: "/staff/overview",
    permission: "overview.view",
    badges: [
      { key: "stockRequests", tone: "warning", label: "solicitações de estoque pendentes" },
      { key: "stockAlerts", tone: "danger", label: "produtos com estoque baixo" },
    ],
  },
  {
    key: "logs",
    label: "Logs",
    tooltip: "Logs",
    Icon: Logs,
    to: "/staff/logs",
    roles: ADMIN_ONLY_ROLES,
  },
]