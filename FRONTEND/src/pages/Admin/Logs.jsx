import { useCallback, useEffect, useState } from "react";
import api from "../../api/api";
import DetailDrawer, { DetailField, DetailSection, formatDateTime } from "../../components/DetailDrawer";

import {
  Button,
  Chip,
  EmptyState,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Table,
  TextField,
  toast,
} from "@heroui/react";

import { ChevronLeft, ChevronRight, Eye, Inbox, Search } from "lucide-react";

// Trilha de auditoria (GET /admin/logs, permissão "logs.view"): quem mudou o quê e quando.
// O Admin sempre vê; para os demais, a permissão é marcada na edição do funcionário.

const ACTIONS = {
  create: { label: "Criou", color: "success" },
  update: { label: "Editou", color: "warning" },
  delete: { label: "Excluiu", color: "danger" },
  login: { label: "Login", color: "default" },
  login_failed: { label: "Login falhou", color: "danger" },
};

const ALL = "__all__";
const PAGE_SIZE = 25;

// "2026-10-25T13:00:00.000Z" -> data/hora local; o resto vira texto legível
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "string") return ISO_DATE.test(value) ? formatDateTime(value) ?? value : value;
  if (Array.isArray(value)) return value.length ? value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ") : "(vazio)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <Select selectedKey={value} onSelectionChange={(key) => onChange(String(key))} className="min-w-44">
      <Label className="text-muted">{label}</Label>
      <Select.Trigger className="border-2 border-border font-semibold">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="p-1">
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export default function Logs() {
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1, models: [], retentionDays: null });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // search com atraso (evita uma chamada por tecla)
  const [action, setAction] = useState(ALL);
  const [model, setModel] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selected, setSelected] = useState(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // qualquer filtro novo volta pra página 1
  useEffect(() => {
    setPage(1);
  }, [query, action, model, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query) params.set("q", query);
      if (action !== ALL) params.set("action", action);
      if (model !== ALL) params.set("model", model);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const result = await api.get(`/admin/logs?${params.toString()}`);
      setData({
        items: Array.isArray(result?.items) ? result.items : [],
        total: result?.total ?? 0,
        totalPages: result?.totalPages ?? 1,
        models: result?.models ?? [],
        retentionDays: result?.retentionDays ?? null,
      });
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível carregar os logs.");
    } finally {
      setLoading(false);
    }
  }, [page, query, action, model, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const actionOptions = [{ id: ALL, label: "Todas as ações" }, ...Object.entries(ACTIONS).map(([id, a]) => ({ id, label: a.label }))];
  const modelOptions = [{ id: ALL, label: "Todas as tabelas" }, ...data.models];
  const modelLabel = (id) => data.models.find((m) => m.id === id)?.label ?? id;
  const hasFilters = query || action !== ALL || model !== ALL || from || to;

  const clearFilters = () => {
    setSearch("");
    setAction(ALL);
    setModel(ALL);
    setFrom("");
    setTo("");
  };

  const openLog = (log) => {
    setSelected(log);
    setIsViewOpen(true);
  };

  // campos alterados: une as chaves de before/after (create só tem after, delete só tem before)
  const fields = selected
    ? [...new Set([...Object.keys(selected.before ?? {}), ...Object.keys(selected.after ?? {})])]
    : [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Logs</h1>
          <p className="text-sm font-semibold text-muted">
            {data.total} registro(s)
            {data.retentionDays ? ` · guardados por ${data.retentionDays} dias` : ""}
          </p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border-2 border-border p-4">
        <TextField className="min-w-60 flex-1" value={search} onChange={setSearch}>
          <Label className="text-muted">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="border-2 border-border pl-9 font-semibold" placeholder="Pessoa, registro, ID ou descrição" />
          </div>
        </TextField>

        <FilterSelect label="Ação" value={action} onChange={setAction} options={actionOptions} />
        <FilterSelect label="Tabela" value={model} onChange={setModel} options={modelOptions} />

        <div className="flex flex-col gap-1">
          <Label className="text-muted">De</Label>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="border-2 border-border font-semibold" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-muted">Até</Label>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="border-2 border-border font-semibold" />
        </div>

        {hasFilters && (
          <Button variant="tertiary" onPress={clearFilters} className="p-6">
            Limpar
          </Button>
        )}
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Logs do sistema" className="min-w-220">
            <Table.Header>
              <Table.Column isRowHeader id="date">Quando</Table.Column>
              <Table.Column id="actor">Quem</Table.Column>
              <Table.Column id="action">Ação</Table.Column>
              <Table.Column id="summary">O que aconteceu</Table.Column>
              <Table.Column className="text-end">Detalhes</Table.Column>
            </Table.Header>

            <Table.Body
              renderEmptyState={() => (
                <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 py-8 text-center">
                  {loading ? <Spinner className="size-6" /> : <Inbox className="size-6 text-muted" />}
                  <span className="text-sm font-semibold text-muted">
                    {loading ? "Carregando…" : "Nenhum log encontrado"}
                  </span>
                </EmptyState>
              )}
            >
              {data.items.map((log) => (
                <Table.Row key={log.id} id={log.id}>
                  <Table.Cell className="min-w-36 text-xs font-semibold">{formatDateTime(log.createdAt)}</Table.Cell>

                  <Table.Cell>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">{log.actorName ?? "—"}</span>
                      <span className="text-xs text-muted">{log.actorRole ?? ""}</span>
                    </div>
                  </Table.Cell>

                  <Table.Cell className="min-w-28">
                    <Chip size="sm" variant="soft" color={ACTIONS[log.action]?.color ?? "default"}>
                      {ACTIONS[log.action]?.label ?? log.action}
                    </Chip>
                  </Table.Cell>

                  <Table.Cell className="max-w-120">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">{log.summary}</span>
                      {log.model && <span className="text-xs text-muted">{modelLabel(log.model)}</span>}
                    </div>
                  </Table.Cell>

                  <Table.Cell>
                    <div className="flex justify-end">
                      <Button isIconOnly size="sm" variant="tertiary" aria-label="Ver detalhes" onPress={() => openLog(log)}>
                        <Eye className="size-5" />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {/* PAGINAÇÃO */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <span className="text-sm font-semibold text-muted">
          Página {page} de {data.totalPages}
        </span>
        <Button isIconOnly variant="tertiary" aria-label="Página anterior" isDisabled={page <= 1 || loading} onPress={() => setPage((p) => p - 1)}>
          <ChevronLeft className="size-5" />
        </Button>
        <Button isIconOnly variant="tertiary" aria-label="Próxima página" isDisabled={page >= data.totalPages || loading} onPress={() => setPage((p) => p + 1)}>
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {/* DETALHES */}
      <DetailDrawer
        isOpen={isViewOpen}
        onOpenChange={setIsViewOpen}
        person={selected && { id: selected.id, name: selected.actorName ?? "Sistema", email: formatDateTime(selected.createdAt) }}
      >
        {selected && (
          <>
            <DetailSection title="O que aconteceu">
              <DetailField label="Resumo" wide>{selected.summary}</DetailField>
              <DetailField label="Ação">
                <Chip size="sm" variant="soft" color={ACTIONS[selected.action]?.color ?? "default"}>
                  {ACTIONS[selected.action]?.label ?? selected.action}
                </Chip>
              </DetailField>
              <DetailField label="Tabela">{selected.model ? modelLabel(selected.model) : null}</DetailField>
              <DetailField label="Registro">{selected.entityLabel}</DetailField>
              <DetailField label="ID do registro">{selected.entityId}</DetailField>
            </DetailSection>

            <DetailSection title="Quem fez">
              <DetailField label="Nome">{selected.actorName}</DetailField>
              <DetailField label="Cargo">{selected.actorRole}</DetailField>
              <DetailField label="Tipo">
                {{ staff: "Equipe", user: "Cliente", system: "Sistema" }[selected.actorType] ?? selected.actorType}
              </DetailField>
              <DetailField label="IP">{selected.ip}</DetailField>
              <DetailField label="Requisição" wide>
                {selected.method && `${selected.method} ${selected.path ?? ""}`}
              </DetailField>
            </DetailSection>

            {fields.length > 0 && (
              <DetailSection title="Alterações">
                {fields.map((field) => (
                  <div key={field} className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted">{field}</span>
                    <div className="flex flex-col gap-1 text-sm font-semibold">
                      {selected.before && field in selected.before && (
                        <span className="wrap-break-word rounded-lg bg-danger-soft px-2 py-1 text-danger-soft-foreground">
                          − {formatValue(selected.before[field])}
                        </span>
                      )}
                      {selected.after && field in selected.after && (
                        <span className="wrap-break-word rounded-lg bg-success-soft px-2 py-1 text-success-soft-foreground">
                          + {formatValue(selected.after[field])}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </DetailSection>
            )}
          </>
        )}
      </DetailDrawer>
    </>
  );
}
