import { useState, useEffect } from "react";
import { Popover, Button, Avatar, Label, Select, ListBox } from "@heroui/react";
import { UserRound, MessageCircle, IdCardLanyard, Calendar, Clock } from "lucide-react";
import { fmtTime } from "./schedulingConstants";

// Iniciais do cliente pro fallback do Avatar quando não há foto
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Opções do dropdown de status - rótulos batem com o StatusMap usado no
// histórico do cliente (SessionHistory.jsx), só que aqui como lista pro Select
const STATUS_OPTIONS = [
  { id: "Scheduled", label: "Aguardando confirmação" },
  { id: "Confirmed", label: "Confirmado" },
  { id: "Completed", label: "Finalizado" },
  { id: "Cancelled", label: "Cancelado" },
  { id: "NoShow", label: "Não compareceu" },
];

// Monta o link de WhatsApp pro NÚMERO DO CLIENTE que agendou (não é o
// WHATSAPP_NUMBER da clínica usado em outras telas - aqui é a equipe
// confirmando a sessão diretamente com quem agendou).
function buildClientWhatsAppUrl(appointment) {
  if (!appointment.clientPhone) return null;

  const digits = appointment.clientPhone.replace(/\D/g, "");
  if (!digits) return null;
  // assume DDI 55 quando o telefone salvo só tem DDD + número
  const withCountryCode = digits.length <= 11 ? `55${digits}` : digits;

  const firstName = appointment.clientName?.trim().split(/\s+/)[0] ?? "";
  const dateLabel = appointment.start.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const message =
    `Olá${firstName ? ` ${firstName}` : ""}, tudo bem? Passando para confirmar sua sessão` +
    `${appointment.title ? ` de ${appointment.title}` : ""} no dia ${dateLabel} às ${fmtTime(appointment.start)}.`;

  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

/**
 * Popover com os detalhes do cliente/profissional e ações rápidas
 * (confirmar por WhatsApp, mudar status, anotar algo) pra cada agendamento
 * da agenda do funcionário.
 */
export default function AppointmentPopover({ appointment, color, onStatusChange, onSaveNotes }) {
  const [notes, setNotes] = useState(appointment.notes ?? "");

  // se o popover for reaberto num agendamento diferente (ou as anotações
  // mudarem por fora), sincroniza o rascunho local
  useEffect(() => {
    setNotes(appointment.notes ?? "");
  }, [appointment.id, appointment.notes]);

  const whatsAppUrl = buildClientWhatsAppUrl(appointment);

  const commitNotes = () => {
    if (notes !== (appointment.notes ?? "")) onSaveNotes(notes);
  };

  return (
    <Popover>
      <Button
        size="md"
        variant="primary"
        aria-label="Detalhes do agendamento"
        className="absolute top-1 right-1 size-8 min-w-0 p-0"
        style={{ backgroundColor: color.color }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <UserRound className="size-8" />
      </Button>

      <Popover.Content className="max-w-100 rounded-2xl">
        <Popover.Dialog>
          <Popover.Heading className="flex items-center gap-3">
            <Avatar size="lg">
              {appointment.clientPhoto && (
                <Avatar.Image alt={appointment.clientName} src={appointment.clientPhoto} />
              )}
              <Avatar.Fallback>{getInitials(appointment.clientName)}</Avatar.Fallback>
            </Avatar>

            <div className="min-w-0">
              <h3 className="truncate font-semibold">
                {appointment.clientName || "Sem cliente vinculado"}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {appointment.clientPhone && (
                  <span className="text-xs text-muted">{appointment.clientPhone}</span>
                )}
                {whatsAppUrl && (
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"
                  >
                    <MessageCircle size={14} />
                    Confirmar sessão
                  </a>
                )}
              </div>
            </div>
          </Popover.Heading>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
               <div className="h-6 w-6 flex items-center justify-center bg-surface-secondary rounded-full"><IdCardLanyard size={14} /></div>
              {appointment.professionalName || "Sem profissional definido"}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2">
                <div className="h-6 w-6 flex items-center justify-center bg-surface-secondary rounded-full"><Calendar size={14} /></div>
                {appointment.start.toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="flex items-center gap-2">
                <div className="h-6 w-6 flex items-center justify-center bg-surface-secondary rounded-full"><Clock size={14} /></div>
                {fmtTime(appointment.start)} – {fmtTime(appointment.end)}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <Label className="mb-1 block text-muted">Status</Label>
            <Select
              aria-label="Status do agendamento"
              className="w-full"
              selectedKey={appointment.status}
              onSelectionChange={onStatusChange}
            >
              <Select.Trigger className="border border-border bg-surface-secondary">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {STATUS_OPTIONS.map((opt) => (
                    <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                      {opt.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <div className="mt-4">
            <Label htmlFor={`ap-notes-${appointment.id}`} className="mb-1 block text-muted">
              Anotações
            </Label>
            <textarea
              id={`ap-notes-${appointment.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              rows={3}
              placeholder="Observações sobre esse agendamento..."
              className="w-full resize-none rounded-lg border border-border bg-surface-secondary p-2 text-sm outline-none focus:border-focus"
            />
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
