import React from 'react'
import { Accordion, Card, Chip } from '@heroui/react';
import { ChevronDown, CalendarPlus, MessageCircle } from 'lucide-react';
import { WHATSAPP_NUMBER } from '../config';

// Chaves batem com o enum AppointmentStatus do schema.prisma - status que
// não estiver aqui quebraria StatusMap[status].border, então cobre todos.
const StatusMap = {
  Scheduled: {
    label: "Aguardando confirmação",
    color: "accent",
    border: "border-accent",
  },
  Confirmed: {
    label: "Confirmado",
    color: "success",
    border: "border-success",
  },
  Completed: {
    label: "Finalizado",
    color: "info",
    border: "border-info",
  },
  Cancelled: {
    label: "Cancelado",
    color: "danger",
    border: "border-danger",
  },
  NoShow: {
    label: "Não compareceu",
    color: "warning",
    border: "border-warning",
  },
};

// Formata só a data/hora do agendamento
function formatDate(appt) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(appt.date));
}

// Formata uma Date pro padrão exigido por arquivos .ics (UTC, sem separadores)
function toIcsDateString(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Escapa vírgula, ponto-e-vírgula e quebra de linha conforme o formato .ics
function escapeIcsText(text) {
  return String(text).replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

// Monta o conteúdo de um arquivo .ics pro evento do agendamento. Abrir esse
// arquivo aciona o app de agenda padrão do dispositivo (Agenda no iPhone,
// Google Agenda/Samsung Calendar no Android, Outlook/Calendário no desktop) -
// não existe uma API web pra abrir o app nativo diretamente, o .ics é o
// jeito padrão e universal de fazer isso.
function buildIcsContent(appt, title) {
  const start = new Date(appt.date);
  const end = appt.endDate ? new Date(appt.endDate) : new Date(start.getTime() + 60 * 60 * 1000);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Agendamentos//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appt.id || appt.code}@agendamentos`,
    `DTSTAMP:${toIcsDateString(new Date())}`,
    `DTSTART:${toIcsDateString(start)}`,
    `DTEND:${toIcsDateString(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    appt.code ? `DESCRIPTION:${escapeIcsText(`Código do agendamento: ${appt.code}`)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

// Gera uma Blob URL do .ics
function buildIcsFileUrl(appt, title) {
  const blob = new Blob([buildIcsContent(appt, title)], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}

// Aciona o download do .ics com o nome do arquivo baseado no código do
// agendamento, e libera a Blob URL logo em seguida
function handleAddToCalendar(appt, title) {
  const url = buildIcsFileUrl(appt, title);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agendamento-${appt.code || appt.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Monta o link do WhatsApp já com a mensagem preenchida
function buildWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

const SessionHistory = ({ appointments = [] }) => {
  return (
    <>
      <div className="mt-8">
        {appointments.map((appt) => {
          const meta = StatusMap[appt.status] ?? StatusMap.Scheduled;
          const title = appt.service?.title || appt.title || "Sem título";

          return (
            <Card key={appt.id} className={`w-full my-4 border-l-8 ${meta.border}`} variant="default">
              <Accordion className="w-full max-w-md" variant="surface">
                <Accordion.Item key={appt.id}>
                  <Accordion.Heading>
                    <Accordion.Trigger>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{title}</span>
                        <div className="flex items-center gap-2">
                          {appt.code && (
                            <span className="text-xs font-semibold tracking-[0.15em] text-muted">
                              #{appt.code}
                            </span>
                          )}
                          <Chip size="sm" variant="soft" color={meta.color} className="self-start">
                            {meta.label}
                          </Chip>
                          
                        </div>
                      </div>
                      <Accordion.Indicator>
                        <ChevronDown />
                      </Accordion.Indicator>
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body>
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1 text-sm">
                          <span className="text-foreground">{formatDate(appt)}</span>
                          {appt.professional?.name && (
                            <span className="text-muted">
                              <span className="font-semibold text-foreground">Profissional: </span>
                              {appt.professional.name}
                            </span>
                          )}
                          {appt.notes?.trim() && (
                            <span className="text-muted">
                              <span className="font-semibold text-foreground">Observações: </span>
                              {appt.notes.trim()}
                            </span>
                          )}
                        </div>

                        {appt.status === "Confirmed" && (
                          <button
                            type="button"
                            onClick={() => handleAddToCalendar(appt, title)}
                            className="flex w-fit items-center gap-2 rounded-lg bg-default px-3 py-2 text-sm font-semibold text-foreground"
                          >
                            <CalendarPlus size={16} />
                            Adicionar à agenda
                          </button>
                        )}

                        {appt.status === "Scheduled" && (
                          <a
                            href={buildWhatsAppUrl(`Olá, quero confirmar meu agendamento #${appt.code}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-fit items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success"
                          >
                            <MessageCircle size={16} />
                            Confirmar pelo WhatsApp
                          </a>
                        )}

                        {appt.status === "NoShow" && (
                          <a
                            href={buildWhatsAppUrl(
                              `Olá, não consegui comparecer no dia, podemos remarcar minha sessão? #${appt.code}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-fit items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm font-semibold text-warning"
                          >
                            <MessageCircle size={16} />
                            Remarcar pelo WhatsApp
                          </a>
                        )}
                      </div>
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Card>
          );
        })}
      </div>
    </>
  )
}

export default SessionHistory
