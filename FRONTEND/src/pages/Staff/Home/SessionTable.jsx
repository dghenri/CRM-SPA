import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  EmptyState,
  Link,
  Popover,
  SearchField,
  Table,
  ToggleButton,
  ToggleButtonGroup,
  Dropdown,
  Label,
} from "@heroui/react";
import { Check, ChevronDown, Inbox, MessageCircle } from "lucide-react";
import { updateAppointmentStatus } from "../../../api/scheduling";
import { notifyAppointmentsChanged } from "../Scheduling/Scheduling";

/* ------------------------------ status meta ------------------------------ */
// Mesmas chaves do enum AppointmentStatus do schema.prisma (ver SessionHistory,
// que é a versão client-side dessa mesma lógica de status).
const StatusMap = {
  Scheduled: { label: "Aguardando confirmação", color: "accent" },
  Confirmed: { label: "Confirmado", color: "success" },
  Completed: { label: "Finalizado", color: "info" },
  Cancelled: { label: "Cancelado", color: "danger" },
  NoShow: { label: "Não compareceu", color: "warning" },
};
const STATUS_ORDER = Object.keys(StatusMap);

const columns = [
  { id: "code", name: "Cód." },
  { id: "service", name: "Procedimento" },
  { id: "name", name: "Cliente" },
  { id: "phone", name: "Telefone" },
  { id: "status", name: "Status" },
  { id: "actions", name: "Ações" },
];

/* ------------------------------ formatting ------------------------------ */

function formatDate(appt) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(appt.start);
}

// Mensagem que o PROFISSIONAL manda pro cliente, varia com o status do
// agendamento (contrário do SessionHistory, que é o cliente mandando pra
// clínica — por isso as mensagens aqui são reescritas, não reaproveitadas).
const CONTACT_MESSAGE_BY_STATUS = {
  Scheduled: (a) =>
    `Olá${a.name ? ` ${a.name}` : ""}, tudo certo? Seu agendamento${a.code ? ` #${a.code}` : ""}${
      a.service ? ` (${a.service})` : ""
    } ainda está aguardando confirmação. Pode confirmar por aqui?`,
  Confirmed: (a) =>
    `Olá${a.name ? ` ${a.name}` : ""}, passando para lembrar do seu horário${
      a.service ? `: ${a.service}` : ""
    } em ${formatDate(a.raw)}. Até lá!`,
  Completed: (a) =>
    `Olá${a.name ? ` ${a.name}` : ""}, obrigado pela sessão de hoje! Qualquer dúvida, estou à disposição.`,
  Cancelled: (a) =>
    `Olá${a.name ? ` ${a.name}` : ""}, seu agendamento${a.code ? ` #${a.code}` : ""} foi cancelado. Podemos remarcar?`,
  NoShow: (a) =>
    `Olá${a.name ? ` ${a.name}` : ""}, sentimos sua falta na sessão de hoje. Podemos remarcar?`,
};

function buildWhatsAppUrl(phoneDigits, message) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

/* -------------------------------- actions -------------------------------- */

function ContactAction({ row }) {
  const phoneDigits = (row.phone || "").replace(/\D/g, "");

  if (!phoneDigits) {
    return <span className="text-xs font-medium text-muted">Sem telefone</span>;
  }

  const buildMessage = CONTACT_MESSAGE_BY_STATUS[row.status] ?? CONTACT_MESSAGE_BY_STATUS.Scheduled;
  const href = buildWhatsAppUrl(phoneDigits, buildMessage(row));

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success no-underline hover:bg-success/20"
    >
      <MessageCircle size={14} />
      Contatar
    </Link>
  );
}

// Popover pra mudar o status do agendamento direto na tabela.
function StatusPopover({ row }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const meta = StatusMap[row.status];

  async function handleSelect(newStatus) {
    if (!newStatus || newStatus === row.status) {
      setIsOpen(false);
      return;
    }
    setIsUpdating(true);
    try {
      await updateAppointmentStatus(row.id, newStatus);
      notifyAppointmentsChanged();
    } catch (err) {
      console.error("Falha ao atualizar status do agendamento:", err);
    } finally {
      setIsUpdating(false);
      setIsOpen(false);
    }
  }

  return (
    <Dropdown>
      <Button
        size="sm"
        isIconOnly
        variant="tertiary"
        isDisabled={isUpdating}
        aria-label={`Alterar status do agendamento de ${row.name}`}
        className="gap-1.5"
      >
        <ChevronDown size={12} />
      </Button>
      <Dropdown.Popover className="rounded-2xl">
        <Dropdown.Menu onAction={(id) => handleSelect(id)}>
          <Dropdown.Item id="Scheduled" textValue="Aguardando confirmação">
            <Label>Aguardando confirmação</Label>
          </Dropdown.Item>
          <Dropdown.Item id="Confirmed" textValue="Confirmado">
            <Label>Confirmado</Label>
          </Dropdown.Item>
          <Dropdown.Item id="Completed" textValue="Finalizado">
            <Label>Finalizado</Label>
          </Dropdown.Item>
          <Dropdown.Item id="Cancelled" textValue="Cancelado">
            <Label>Cancelado</Label>
          </Dropdown.Item>
          <Dropdown.Item id="NoShow" textValue="Não compareceu">
            <Label>Não compareceu</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/* --------------------------------- table --------------------------------- */

export default function SessionTable({ appointments = [] }) {
  const [query, setQuery] = useState("");
  const [activeStatuses, setActiveStatuses] = useState(() => new Set());

  /* ----------------------------------- linhas ----------------------------------- */
  const rows = useMemo(() => {
    return [...appointments]
      .sort((a, b) => b.start - a.start) // mais recentes primeiro
      .map((a) => ({
        id: a.id,
        code: a.code || "—",
        service: a.serviceName || a.title || "—",
        name: a.clientName || "—",
        phone: a.clientPhone || "",
        status: a.status,
        raw: a,
      }));
  }, [appointments]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeStatuses.size > 0 && !activeStatuses.has(r.status)) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.service.toLowerCase().includes(q)
      );
    });
  }, [rows, query, activeStatuses]);

  return (
    <div className="flex h-25 flex-col bg-overlay  rounded-2xl">
      {/* barra de busca + filtros */}
      <div className="grid grid-cols-5 justify-between gap-3 p-3 rounded-2xl font-semibold">
        <SearchField value={query} onChange={setQuery} aria-label="Buscar agendamentos" className="col-span-2">
          <SearchField.Group className="bg-surface-secondary border border-border">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Buscar por nome, telefone, código ou serviço" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <div className="flex col-span-3 flex-wrap items-center justify-end gap-2">
          <ToggleButtonGroup
            aria-label="Filtrar por status"
            selectionMode="multiple"
            selectedKeys={activeStatuses}
            onSelectionChange={setActiveStatuses}
            className="border-2 border-border rounded-2xl"
          >
            {STATUS_ORDER.map((status, i) => (
              <ToggleButton key={status} id={status}>
                {i > 0 && <ToggleButtonGroup.Separator />}
                {StatusMap[status].label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {activeStatuses.size > 0 && (
            <Button variant="danger-soft" size="sm" onPress={() => setActiveStatuses(new Set())}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* tabela */}
      <Table className="border-2">
        <Table.ScrollContainer className="h-[280px] overflow-y-auto">
          <Table.Content aria-label="Agendamentos" className="min-w-[860px]">
            <Table.Header className="sticky top-0 z-10 bg-surface-secondary">
              
              {columns.map((col) => (
                <Table.Column key={col.id} id={col.id} isRowHeader={col.id === "name"}>
                  {col.name}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body
                renderEmptyState={() => (
                <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center py-8">
                  <Inbox className="size-6 text-muted" />
                  <span className="text-sm font-semibold text-muted">No results found</span>
                </EmptyState>
              )}
            >
              <Table.Collection items={filteredRows}>
                {(row) => (
                  <Table.Row>
                    <Table.Cell className="font-mono text-xs text-muted">{row.code}</Table.Cell>
                    <Table.Cell className="font-medium">{row.service}</Table.Cell>
                    <Table.Cell className="font-medium">{row.name}</Table.Cell>
                    <Table.Cell className="text-muted">{row.phone || "—"}</Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft" color={StatusMap[row.status]?.color ?? "default"}>
                        {StatusMap[row.status]?.label ?? row.status}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <StatusPopover row={row} />
                        <ContactAction row={row} />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Collection>
              
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}