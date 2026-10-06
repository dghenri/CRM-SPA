import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Chip, Label, Modal, TextArea, TextField, toast } from "@heroui/react";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Inbox,
  PackageCheck,
  Receipt,
  Repeat,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

/* ---------------------------------------------------------------------------
 * Mesmo cliente de API do Storage.jsx (token em localStorage("token"), API em
 * VITE_API_URL). Quando você me enviar o seu cliente de API / auth, eu movo
 * isto e os helpers de formatação para um arquivo compartilhado.
 * ------------------------------------------------------------------------- */
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const getToken = () => localStorage.getItem("token");

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Erro inesperado.");
  return data;
}

/* ------------------------------ formatação ------------------------------- */
const UNIT_LABEL = { Un: "un", Ml: "ml", G: "g" };
const ROLE_LABEL = { MajorAdmin: "Admin", Farmaceutica: "Farmacêutica", Massoterapeuta: "Massoterapeuta" };
const REQUEST_VERB = {
  Purchase: "adicionar ao estoque",
  Loss: "registrar perda de",
  Adjustment: "ajustar o estoque de",
};
const TYPE_LABEL = { Purchase: "Entrada", Loss: "Perda", Adjustment: "Ajuste" };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtNum = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtQty = (n, unit) => `${fmtNum(n)} ${UNIT_LABEL[unit] ?? ""}`.trim();
const fmtPercent = (n) => `${Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function describeItem(type, item) {
  if (type === "Purchase") {
    const label = item.purchaseUnitLabel || "embalagem";
    return `${fmtNum(item.packages)} ${label}(s) de ${item.productName} (${fmtQty(item.quantity, item.unit)})`;
  }
  const sign = type === "Adjustment" && item.quantity > 0 ? "+" : "";
  return `${sign}${fmtQty(item.quantity, item.unit)} de ${item.productName}`;
}

/* ------------------------------ cards de KPI ----------------------------- */
// goodWhen: se subir é bom ("up") ou ruim ("down") - define a cor da variação
const KPI_CARDS = [
  { key: "revenue", title: "Faturamento", icon: Wallet, format: (v) => brl.format(v), goodWhen: "up" },
  { key: "sessions", title: "Sessões", icon: CalendarCheck, format: (v) => fmtNum(v), goodWhen: "up" },
  { key: "averageTicket", title: "Ticket médio", icon: Receipt, format: (v) => brl.format(v), goodWhen: "up" },
  { key: "newCustomers", title: "Novos clientes", icon: UserPlus, format: (v) => fmtNum(v), goodWhen: "up" },
  {
    key: "returningCustomers",
    title: "Clientes recorrentes",
    icon: Repeat,
    format: (v) => (v == null ? "—" : fmtPercent(v)),
    goodWhen: "up",
  },
  { key: "cancellationRate", title: "Cancelamentos", icon: XCircle, format: (v) => fmtPercent(v), goodWhen: "down" },
];

function Change({ card, goodWhen }) {
  const { change, unit } = card;
  if (change == null) return <span className="text-xs font-semibold text-muted">Sem base de comparação</span>;
  if (change === 0) return <span className="text-xs font-semibold text-muted">Sem variação vs mês anterior</span>;

  const isGood = (change > 0) === (goodWhen === "up");
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  const value = Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${isGood ? "text-success" : "text-danger"}`}>
      <Icon size={14} aria-hidden="true" />
      {change > 0 ? "+" : "−"}
      {value}
      {unit === "pp" ? " p.p." : "%"}
      <span className="font-semibold text-muted">vs mês anterior</span>
    </span>
  );
}

function KpiCard({ config, card }) {
  const Icon = config.icon;
  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title className="text-sm font-medium text-muted">{config.title}</Card.Title>
        <Icon size={18} className="text-muted" aria-hidden="true" />
      </Card.Header>
      <Card.Content className="gap-2">
        <span className="text-3xl font-semibold tracking-tight">{config.format(card?.value)}</span>
        {card && <Change card={card} goodWhen={config.goodWhen} />}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ gráfico de barras ------------------------ */
// teto "redondo" para o eixo (1, 2, 5 x 10^n)
function niceCeil(max) {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const METRICS = {
  revenue: {
    label: "Faturamento",
    full: (v) => brl.format(v),
    axis: (v) => (v === 0 ? "0" : brlCompact.format(v)),
  },
  sessions: {
    label: "Sessões",
    full: (v) => `${fmtNum(v)} sessões`,
    axis: (v) => fmtNum(Math.round(v * 10) / 10),
  },
};

function BarChart({ series, metric }) {
  const [active, setActive] = useState(null);
  const m = METRICS[metric];
  const top = niceCeil(Math.max(0, ...series.map((s) => s[metric])));
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {/* eixo Y */}
        <div className="flex h-56 w-14 shrink-0 flex-col justify-between text-right text-xs text-muted" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="-my-1.5">
              {m.axis(top * t)}
            </span>
          ))}
        </div>

        {/* área do gráfico */}
        <div className="relative h-56 flex-1" role="group" aria-label={`${m.label} por mês`}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${t * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
            {series.map((s, i) => {
              const value = s[metric];
              const isCurrent = i === series.length - 1;
              const heightPct = (value / top) * 100;
              return (
                <button
                  key={s.key}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  aria-label={`${s.label} de ${s.year}: ${m.full(value)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  {active === i && (
                    <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md">
                      {s.label}/{String(s.year).slice(2)} · {m.full(value)}
                    </span>
                  )}
                  <span
                    className={`w-full max-w-9 rounded-t-md transition-colors group-focus-visible:ring-2 group-focus-visible:ring-focus ${
                      isCurrent || active === i ? "bg-accent" : "bg-accent/35"
                    }`}
                    style={{ height: value > 0 ? `max(${heightPct}%, 2px)` : "0" }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* eixo X */}
      <div className="flex gap-3" aria-hidden="true">
        <div className="w-14 shrink-0" />
        <div className="flex flex-1 gap-1 sm:gap-2">
          {series.map((s) => (
            <span key={s.key} className="flex-1 text-center text-xs capitalize text-muted">
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* versão em tabela para leitores de tela */}
      <table className="sr-only">
        <caption>{m.label} por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">{m.label}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <th scope="row">
                {s.label}/{s.year}
              </th>
              <td>{m.full(s[metric])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartCard({ series }) {
  const [metric, setMetric] = useState("revenue");
  const [range, setRange] = useState(12);
  const visible = useMemo(() => series.slice(-range), [series, range]);

  const pill = (active) => (active ? "primary" : "tertiary");

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row flex-wrap items-center justify-between gap-3">
        <Card.Title className="text-lg font-semibold">{METRICS[metric].label} por mês</Card.Title>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1" role="group" aria-label="Métrica">
            {Object.entries(METRICS).map(([key, v]) => (
              <Button key={key} size="sm" className="rounded-full" variant={pill(metric === key)} onPress={() => setMetric(key)}>
                {v.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Período">
            {[6, 12].map((n) => (
              <Button key={n} size="sm" className="rounded-full" variant={pill(range === n)} onPress={() => setRange(n)}>
                {n} meses
              </Button>
            ))}
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <BarChart series={visible} metric={metric} />
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ estoque: pendentes ----------------------- */
function PendingRequestItem({ request, busy, onApprove, onReject }) {
  const MAX_ITEMS = 3;
  const extra = request.items.length - MAX_ITEMS;

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold">{request.requestedBy?.name ?? "—"}</span>{" "}
            <span className="text-muted">({ROLE_LABEL[request.requestedBy?.role] ?? "—"})</span> quer{" "}
            {REQUEST_VERB[request.type]}:
          </p>
          <Chip size="sm" variant="soft" color={request.type === "Loss" ? "danger" : "default"}>
            {TYPE_LABEL[request.type]}
          </Chip>
        </div>
        <ul className="list-disc pl-5 text-sm">
          {request.items.slice(0, MAX_ITEMS).map((item, idx) => (
            <li key={idx}>{describeItem(request.type, item)}</li>
          ))}
        </ul>
        {extra > 0 && <p className="pl-5 text-xs text-muted">+ {extra} item(ns)</p>}
        {request.reason && <p className="text-xs text-muted">Motivo: {request.reason}</p>}
        <p className="text-xs text-muted">{fmtDateTime(request.createdAt)}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="rounded-lg" isPending={busy} onPress={() => onApprove(request)}>
          <Check size={16} />
          Aprovar
        </Button>
        <Button size="sm" className="rounded-lg" variant="danger-soft" isDisabled={busy} onPress={() => onReject(request)}>
          <X size={16} />
          Negar
        </Button>
      </div>
    </li>
  );
}

function PendingRequestsCard({ requests, busyId, onApprove, onReject }) {
  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title className="text-lg font-semibold">Solicitações de estoque</Card.Title>
        {requests.length > 0 && (
          <Chip color="warning" variant="soft" size="sm">
            {requests.length} pendente{requests.length > 1 ? "s" : ""}
          </Chip>
        )}
      </Card.Header>
      <Card.Content>
        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Inbox className="text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhuma solicitação pendente</span>
          </div>
        ) : (
          <ul className="flex max-h-112 bg-da flex-col gap-3 overflow-y-auto pr-1">
            {requests.map((r) => (
              <PendingRequestItem key={r.id} request={r} busy={busyId === r.id} onApprove={onApprove} onReject={onReject} />
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ estoque: alertas ------------------------- */
function StockAlertsCard({ products }) {
  const flagged = products.filter((p) => p.active && Object.values(p.alerts).some(Boolean));

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title className="text-lg font-semibold">Alertas de estoque</Card.Title>
        {flagged.length > 0 && (
          <Chip color="danger" variant="soft" size="sm">
            {flagged.length}
          </Chip>
        )}
      </Card.Header>
      <Card.Content>
        {flagged.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <PackageCheck className="text-muted" />
            <span className="text-sm font-semibold text-muted">Estoque em dia</span>
          </div>
        ) : (
          <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
            {flagged.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle size={14} className="text-warning" aria-hidden="true" />
                    {p.name}
                  </span>
                  <span className="text-xs text-muted font-semibold">{fmtQty(p.currentStock, p.unit)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.alerts.lowStock && <Chip color="warning" variant="soft" size="sm">Repor</Chip>}
                  {p.alerts.expired && <Chip color="danger" variant="soft" size="sm">Lote vencido</Chip>}
                  {p.alerts.expiringSoon && <Chip color="warning" variant="soft" size="sm">Vence em breve</Chip>}
                  {p.alerts.openedExpired && <Chip color="danger" variant="soft" size="sm">Frasco aberto vencido</Chip>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ modal: negar ----------------------------- */
function RejectModal({ request, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setNote(""), [request]);

  async function reject() {
    setSaving(true);
    try {
      await api(`/stock/requests/${request.id}/reject`, { method: "PATCH", body: { reviewNote: note } });
      toast("Solicitação negada.");
      onDone();
      onClose();
    } catch (e) {
      toast.danger(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={!!request} onOpenChange={(o) => !o && onClose()} isDismissable={!saving}>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Negar solicitação</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="p-1">
                <TextField fullWidth value={note} onChange={setNote}>
                  <Label>Motivo (opcional)</Label>
                  <TextArea placeholder="Aparece para quem solicitou" />
                </TextField>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={onClose} isDisabled={saving}>
                Voltar
              </Button>
              <Button variant="danger" onPress={reject} isPending={saving}>
                Negar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------ página ----------------------------------- */
export default function Overview() {
  const [me, setMe] = useState(null);
  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [staff, ov, reqs, prods] = await Promise.all([
        api("/auth/staff/me"),
        api("/admin/overview?months=12"),
        api("/stock/requests?status=Pending"),
        api("/products"),
      ]);
      setMe(staff);
      setOverview(ov);
      setPending(reqs);
      setProducts(prods);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // tempo real: pedidos de estoque e agendamentos concluídos mudam os números
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`);
    ws.onmessage = (ev) => {
      try {
        const { type } = JSON.parse(ev.data);
        if (type === "stock-changed" || type === "appointments-changed") load();
      } catch {
        /* mensagem que não é JSON: ignora */
      }
    };
    return () => {
      ws.onmessage = null;
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
      else ws.close();
    };
  }, [load]);

  async function approve(request) {
    setBusyId(request.id);
    try {
      await api(`/stock/requests/${request.id}/approve`, { method: "PATCH" });
      toast.success("Solicitação aprovada e aplicada ao estoque.");
      load();
    } catch (e) {
      toast.danger(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted text-center font-medium py-10">Carregando overview</p>;

  const monthName = overview
    ? new Date(overview.month.year, Number(overview.month.key.slice(5)) - 1, 1).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "";
  const firstName = me?.name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm font-semibold text-muted">
          {firstName ? `Olá, ${firstName}. ` : ""}
          {monthName && (
            <>
              Resumo de <span className="capitalize">{monthName}</span> comparado ao mês anterior.
            </>
          )}
        </p>
      </div>

      {loadError && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar o overview</Alert.Title>
            <Alert.Description>{loadError}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {overview && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {KPI_CARDS.map((config) => (
                <KpiCard key={config.key} config={config} card={overview.cards[config.key]} />
              ))}
            </div>
            <ChartCard series={overview.series} />
          </div>

          <div className="flex flex-col gap-6">
            <PendingRequestsCard requests={pending} busyId={busyId} onApprove={approve} onReject={setRejecting} />
            <StockAlertsCard products={products} />
            {/* Resumo dos cupons aqui */}
          </div>
        </div>
      )}

      <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={load} />
    </div>
  );
}
