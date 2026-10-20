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
} from "lucide-react";

// Cargos existentes em prisma.Staff.role - usados pra filtrar quais itens
// de navegação cada colaborador logado enxerga na sidebar. Item sem
// "roles" definido é tratado como visível para todos os cargos (ver
// filtro em Sidebar.jsx).
export const ALL_STAFF_ROLES = ["MajorAdmin", "Farmaceutica", "Massoterapeuta"];
export const ADMIN_ONLY_ROLES = ["MajorAdmin"];

export const mainItems = [
  {
    key: "home",
    label: "Home",
    tooltip: "Home",
    Icon: House,
    to: "/staff",
    badge: 0,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "Cronograma",
    label: "Cronograma",
    tooltip: "Cronograma",
    Icon: CalendarRange,
    to: "/staff/scheduling",
    badge: 0,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "procedimentos",
    label: "Procedimentos",
    tooltip: "Procedimentos",
    Icon: Store,
    to: "/staff/services",
    badge: 0,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "cupons",
    label: "Cupons",
    tooltip: "Cupons",
    Icon: Ticket,
    to: "/staff/coupons",
    badge: 0,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "estoque",
    label: "Estoque",
    tooltip: "Estoque",
    Icon: ShelvingUnit,
    to: "/staff/storage",
    badge: 0,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "receita",
    label: "Receita",
    tooltip: "Receita",
    Icon: Receipt,
    to: "/staff/revenue",
    badge: 0,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: "comunicação",
    label: "Comunicação",
    tooltip: "Comunicação",
    Icon: Megaphone,
    to: "/staff/communication",
    badge: 0,
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
    key: "users",
    label: "Users",
    group:"Users",
    Icon: UsersRound,
    to: "/staff/users",
    roles: ADMIN_ONLY_ROLES,
  },
  {
    key: "logs",
    label: "Logs",
    group:"Logs",
    Icon: Logs,
    to: "/staff/logs",
    roles: ADMIN_ONLY_ROLES,
  },
];

export const managementItems = [
  {
    key: "overview",
    label: "Overview",
    tooltip: "Overview",
    Icon: Target,
    // TODO: ainda não existe rota "/staff/overview" em
    // staffRoutes.jsx - link fica quebrado até essa rota ser criada
    to: "/staff/overview",
    roles: ADMIN_ONLY_ROLES,
  },
  {
    key: "logs",
    label: "Logs",
    tooltip: "Logs",
    Icon: Logs,
    // TODO: ainda não existe rota "/staff/logs" em
    // staffRoutes.jsx - link fica quebrado até essa rota ser criada
    to: "/staff/logs",
    roles: ADMIN_ONLY_ROLES,
  },
]