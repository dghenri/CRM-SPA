import { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Popover,
  SearchField,
  Table,
  ToggleButton,
  ToggleButtonGroup,
  Dropdown,
  Label,
} from "@heroui/react";
import { ChevronDown, Eye, Inbox, MessageCircle, UserRound } from "lucide-react";
import { updateAppointmentStatus } from "../../../api/scheduling";
import { notifyAppointmentsChanged } from "../Scheduling/Scheduling";
import { assetUrl } from "../../../api/api";
import DetailDrawer, { DetailField, DetailSection, formatDateTime } from "../../../components/DetailDrawer";

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

// Link do WhatsApp com a mensagem certa pro status do agendamento (null se não há telefone)
function getContactHref(row) {
  const phoneDigits = (row.phone || "").replace(/\D/g, "");
  if (!phoneDigits) return null;
  const buildMessage = CONTACT_MESSAGE_BY_STATUS[row.status] ?? CONTACT_MESSAGE_BY_STATUS.Scheduled;
  return buildWhatsAppUrl(phoneDigits, buildMessage(row));
}

const openWhatsApp = (href) => window.open(href, "_blank", "noopener,noreferrer");

// Botão do WhatsApp no padrão do HeroUI (mesmo tamanho/forma do botão de status ao lado).
// Com `label`, vira um botão largo com texto (usado no drawer).
function ContactAction({ row, label }) {
  const href = getContactHref(row);

  if (!href) {
    return <span className="text-xs font-medium text-muted">Sem telefone</span>;
  }

  return (
    <Button
      size="sm"
      isIconOnly={!label}
      variant="tertiary"
      aria-label={`Enviar mensagem no WhatsApp para ${row.name}`}
      className="gap-1.5 bg-success/10 text-success hover:bg-success/20"
      onPress={() => openWhatsApp(href)}
    >
      <MessageCircle size={14} />
      {label}
    </Button>
  );
}

// Popover pra mudar o status do agendamento direto na tabela.
function ViewAction({ row, onView }) {
  return (
    <Button
      size="sm"
      isIconOnly
      variant="tertiary"
      aria-label={`Ver detalhes do agendamento de ${row.name}`}
      onPress={() => onView(row.id)}
    >
      <Eye size={14} />
    </Button>
  );
}

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
  // drawer de detalhes: guarda só o id e busca a linha em `rows`, assim o status
  // mostrado acompanha a atualização feita pelo próprio drawer
  const [viewId, setViewId] = useState(null);

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

  const viewRow = useMemo(() => rows.find((r) => r.id === viewId) ?? null, [rows, viewId]);

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
    <div className="flex flex-col rounded-2xl bg-overlay">
      {/* barra de busca + filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl p-3 font-semibold lg:grid-cols-5">
        <SearchField value={query} onChange={setQuery} aria-label="Buscar agendamentos" className="lg:col-span-2">
          <SearchField.Group className="bg-surface-secondary border border-border">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Buscar por nome, telefone, código ou serviço" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:col-span-3 lg:justify-end">
          {/* os 5 filtros não cabem no celular: rolam na horizontal */}
          <div className="max-w-full overflow-x-auto rounded-2xl">
            <ToggleButtonGroup
              aria-label="Filtrar por status"
              selectionMode="multiple"
              selectedKeys={activeStatuses}
              onSelectionChange={setActiveStatuses}
              className="w-max rounded-2xl border-2 border-border"
            >
              {STATUS_ORDER.map((status, i) => (
                <ToggleButton key={status} id={status}>
                  {i > 0 && <ToggleButtonGroup.Separator />}
                  {StatusMap[status].label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          {activeStatuses.size > 0 && (
            <Button variant="danger-soft" size="sm" onPress={() => setActiveStatuses(new Set())}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* celular: cartões (a tabela de 6 colunas não cabe) */}
      <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto px-3 pb-3 md:hidden">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <Inbox className="size-6 text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhum resultado</span>
          </div>
        ) : (
          filteredRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.service}</p>
                  <p className="truncate text-sm font-medium text-muted">{row.name}</p>
                </div>
                <Chip size="sm" variant="soft" color={StatusMap[row.status]?.color ?? "default"} className="shrink-0">
                  {StatusMap[row.status]?.label ?? row.status}
                </Chip>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
                <span className="font-mono">{row.code}</span>
                <span>{row.phone || "Sem telefone"}</span>
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <ViewAction row={row} onView={setViewId} />
                <StatusPopover row={row} />
                <ContactAction row={row} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* tablet e desktop: tabela */}
      <Table className="hidden border-2 md:block">
        <Table.ScrollContainer className="max-h-[280px] overflow-auto">
          <Table.Content aria-label="Agendamentos" className="min-w-[860px]">
            <Table.Header className="sticky top-0 z-10 bg-surface-secondary">
              {columns.map((col) => (
                <Table.Column key={col.id} id={col.id} isRowHeader={col.id === "name"} className={col.id === "actions" ? "text-end" : undefined}>
                  {col.name}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center py-8">
                  <Inbox className="size-6 text-muted" />
                  <span className="text-sm font-semibold text-muted">Nenhum resultado</span>
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
                      <div className="flex items-center justify-end gap-2">
                        <ViewAction row={row} onView={setViewId} />
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

      {/* drawer: ficha completa do agendamento */}
      <DetailDrawer
        isOpen={!!viewRow}
        onOpenChange={(open) => !open && setViewId(null)}
        person={viewRow && { id: viewRow.id, name: viewRow.name === "—" ? "Sem cliente vinculado" : viewRow.name, email: viewRow.phone || undefined }}
        avatarSrc={assetUrl(viewRow?.raw.clientPhoto)}
      >
        {viewRow && (
          <>
            <DetailSection title="Sessão">
              <DetailField label="Procedimento" wide>{viewRow.service}</DetailField>
              <DetailField label="Código">
                <span className="font-mono">{viewRow.code}</span>
              </DetailField>
              <DetailField label="Status">
                <div className="flex items-center gap-2">
                  <Chip size="sm" variant="soft" color={StatusMap[viewRow.status]?.color ?? "default"}>
                    {StatusMap[viewRow.status]?.label ?? viewRow.status}
                  </Chip>
                  <StatusPopover row={viewRow} />
                </div>
              </DetailField>
              <DetailField label="Início">{formatDateTime(viewRow.raw.start)}</DetailField>
              <DetailField label="Término">{formatDateTime(viewRow.raw.end)}</DetailField>
              <DetailField label="Duração">
                {`${Math.round((viewRow.raw.end - viewRow.raw.start) / 60_000)} min`}
              </DetailField>
            </DetailSection>

            <DetailSection title="Cliente">
              <DetailField label="Nome">{viewRow.name === "—" ? null : viewRow.name}</DetailField>
              <DetailField label="Telefone">{viewRow.phone}</DetailField>
              {viewRow.phone && (
                <div className="sm:col-span-2">
                  <ContactAction row={viewRow} label="Falar no WhatsApp" />
                </div>
              )}
            </DetailSection>

            <DetailSection title="Profissional">
              <DetailField label="Responsável" wide>
                {viewRow.raw.professionalName && (
                  <div className="flex items-center gap-2">
                    <Avatar size="sm" className="size-7">
                      {viewRow.raw.professionalPhoto && (
                        <Avatar.Image alt={viewRow.raw.professionalName} src={assetUrl(viewRow.raw.professionalPhoto)} />
                      )}
                      <Avatar.Fallback>
                        <UserRound className="size-4" />
                      </Avatar.Fallback>
                    </Avatar>
                    {viewRow.raw.professionalName}
                  </div>
                )}
              </DetailField>
            </DetailSection>

            {viewRow.raw.notes && (
              <DetailSection title="Anotações">
                <DetailField label="Observações" wide>
                  <span className="whitespace-pre-wrap font-medium">{viewRow.raw.notes}</span>
                </DetailField>
              </DetailSection>
            )}
          </>
        )}
      </DetailDrawer>
    </div>
  );
}
