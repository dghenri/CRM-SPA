// Constantes e helpers usados tanto pela Agenda (Scheduling.jsx) quanto
// pelos componentes de agendamento (AppointmentCard, AppointmentPopover).
// Ficam num arquivo à parte pra evitar import circular: se AppointmentCard
// importasse isso direto de Scheduling.jsx, e Scheduling.jsx importasse
// AppointmentCard de volta, os dois arquivos ficariam esperando um pelo
// outro no carregamento.

export const COLORS = [
  {
    id: "blue",
    color: "#3B82F6",
    bg: "bg-blue-500/25",
    border: "border-blue-500",
    soft: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  },
  {
    id: "violet",
    color: "#7239EE",
    bg: "bg-violet-500/25",
    border: "border-violet-500",
    soft: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  },
  {
    id: "emerald",
    color: "#10B981",
    bg: "bg-emerald-500/25",
    border: "border-emerald-500",
    soft: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  },
  {
    id: "amber",
    color: "#F6CA2D",
    bg: "bg-amber-500/25",
    border: "border-amber-500",
    soft: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  {
    id: "rose",
    color: "#F5749A",
    bg: "bg-rose-500/25",
    border: "border-rose-500",
    soft: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  },
  {
    id: "slate",
    color: "#B2B1B8",
    bg: "bg-slate-500/25",
    border: "border-slate-500",
    soft: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  },
];

export const colorMap = Object.fromEntries(COLORS.map((c) => [c.id, c]));
export const hexById = Object.fromEntries(COLORS.map((c) => [c.id, c.color]));
export const idByHex = Object.fromEntries(COLORS.map((c) => [c.color.toLowerCase(), c.id]));

// Cor do card por STATUS (a cor deixa de ser escolhida na mão):
// Aguardando = azul, Confirmado = verde, Finalizado = cinza,
// Cancelado = vermelho, Não compareceu = amarelo.
// As classes ficam escritas por extenso para o Tailwind enxergá-las.
export const STATUS_COLORS = {
  Scheduled: colorMap.blue,
  Confirmed: colorMap.emerald,
  Completed: colorMap.slate,
  Cancelled: {
    id: "red",
    color: "#EF4444",
    bg: "bg-red-500/25",
    border: "border-red-500",
    soft: "bg-red-500/15 text-red-700 border-red-500/30",
  },
  NoShow: colorMap.amber,
};

// Cor a usar para um agendamento (status desconhecido cai no azul)
export const colorForAppointment = (appointment) =>
  STATUS_COLORS[appointment?.status] ?? STATUS_COLORS.Scheduled;

export const SLOT_MIN = 5;
export const SLOT_PX = 5;

export function fmtTime(d) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
