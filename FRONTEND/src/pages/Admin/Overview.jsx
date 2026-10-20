import { useCallback, useEffect, useState } from "react";
import { Alert, Avatar, Button, Card, Chip, Label, Modal, TextArea, TextField, toast } from "@heroui/react";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Inbox,
  PackageCheck,
  Receipt,
  Repeat,
  Ticket,
  Trophy,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { subscribeRealtime } from "../../realtime/socket";

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
const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
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
    full: (v) => `${fmtNum(v)} ${Number(v) === 1 ? "sessão" : "sessões"}`,
    axis: (v) => fmtNum(Math.round(v * 10) / 10),
  },
};

/* ------------------------------ filtros de período ----------------------- */
// Filtro em texto (1D 1W 1M ...): o selecionado fica azul. Também usado nos cards.
function RangeTabs({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus ${
            value === o.id ? "text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// período do gráfico (o back-end escolhe a granularidade: hora, dia, semana ou mês)
const CHART_RANGES = [
  { id: "1D", label: "1D", title: "hoje, por hora" },
  { id: "1W", label: "1W", title: "últimos 7 dias" },
  { id: "1M", label: "1M", title: "últimos 30 dias" },
  { id: "3M", label: "3M", title: "últimas 13 semanas" },
  { id: "1Y", label: "1Y", title: "últimos 12 meses" },
  { id: "ALL", label: "All", title: "todo o período" },
];
// período dos cards de cupons e clientes
const CARD_PERIODS = [
  { id: "1W", label: "1W", title: "últimos 7 dias" },
  { id: "1M", label: "1M", title: "últimos 30 dias" },
  { id: "3M", label: "3M", title: "últimos 90 dias" },
  { id: "1Y", label: "1Y", title: "últimos 12 meses" },
  { id: "ALL", label: "All", title: "todo o período" },
];

// busca com cancelamento; `tick` muda quando o tempo real avisa que algo mudou.
// Mantém o dado anterior na tela enquanto recarrega (sem piscar).
function useInsight(path, tick) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    api(path)
      .then((data) => !cancelled && setState({ data, loading: false, error: "" }))
      .catch((e) => !cancelled && setState((prev) => ({ ...prev, loading: false, error: e.message })));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  return state;
}

function CardError({ message }) {
  return <p className="py-6 text-center text-sm font-semibold text-danger">{message}</p>;
}

function BarChart({ series, metric, title }) {
  const [active, setActive] = useState(null);
  const m = METRICS[metric];
  const top = niceCeil(Math.max(0, ...series.map((s) => s[metric])));
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  // com muitas barras (30 dias, 13 semanas...) só alguns rótulos aparecem, sempre ancorados na última barra
  const labelStep = Math.max(1, Math.ceil(series.length / 12));
  const dense = series.length > 14;

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
        <div className="relative h-56 flex-1" role="group" aria-label={`${m.label}, ${title}`}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${t * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className={`absolute inset-0 flex items-end ${dense ? "gap-0.5" : "gap-1 sm:gap-2"}`}>
            {series.map((s, i) => {
              const value = s[metric];
              const isCurrent = i === series.length - 1;
              const heightPct = (value / top) * 100;
              return (
                <button
                  key={s.key}
                  type="button"
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                  aria-label={`${s.tooltip}: ${m.full(value)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  {active === i && (
                    <span
                      className={`pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md ${
                        i < series.length / 4 ? "left-0" : i > (series.length * 3) / 4 ? "right-0" : ""
                      }`}
                    >
                      {s.tooltip} · {m.full(value)}
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
        <div className={`flex flex-1 ${dense ? "gap-0.5" : "gap-1 sm:gap-2"}`}>
          {series.map((s, i) => (
            <span key={s.key} className="relative h-4 min-w-0 flex-1 text-xs capitalize text-muted">
              {(series.length - 1 - i) % labelStep === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{s.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* versão em tabela para leitores de tela */}
      <table className="sr-only">
        <caption>
          {m.label}, {title}
        </caption>
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col">{m.label}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.tooltip}</th>
              <td>{m.full(s[metric])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartCard({ tick }) {
  const [metric, setMetric] = useState("revenue");
  const [range, setRange] = useState("1M");
  const { data, loading, error } = useInsight(`/admin/overview/chart?range=${range}`, tick);

  const pill = (active) => (active ? "primary" : "tertiary");
  const rangeTitle = CHART_RANGES.find((r) => r.id === range).title;
  const total = data ? METRICS[metric].full(data.totals[metric]) : null;

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Card.Title className="text-lg font-semibold">{METRICS[metric].label}</Card.Title>
          <p className="text-xs font-semibold text-muted first-letter:uppercase">{rangeTitle}</p>
          {total && <p className="text-2xl font-semibold tracking-tight">{total}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <RangeTabs label="Período do gráfico" options={CHART_RANGES} value={range} onChange={setRange} />
          <div className="flex gap-1" role="group" aria-label="Métrica">
            {Object.entries(METRICS).map(([key, v]) => (
              <Button key={key} size="sm" className="rounded-full" variant={pill(metric === key)} onPress={() => setMetric(key)}>
                {v.label}
              </Button>
            ))}
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : data ? (
          <div className={`transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
            <BarChart series={data.series} metric={metric} title={rangeTitle} />
          </div>
        ) : (
          <p className="py-24 text-center text-sm font-medium text-muted">Carregando gráfico</p>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ card: cupons ----------------------------- */
const COUPON_SORTS = [
  { id: "uses", label: "Mais usados" },
  { id: "discount", label: "Maior desconto" },
  { id: "average", label: "Desconto médio" },
];

function ShareBar({ pct }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-default" aria-hidden="true">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 3)}%` }} />
    </div>
  );
}

function CouponsCard({ tick }) {
  const [period, setPeriod] = useState("1M");
  const [sort, setSort] = useState("uses");
  const { data, loading, error } = useInsight(`/admin/overview/coupons?period=${period}&sort=${sort}`, tick);

  const items = data?.items ?? [];
  // a barra e o destaque seguem o critério escolhido
  const metricOf = (c) => (sort === "uses" ? c.uses : sort === "discount" ? c.discountTotal : c.averageDiscount);
  const maxMetric = Math.max(0, ...items.map(metricOf));

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-col items-stretch gap-2">
        <div className="flex items-center justify-between gap-2">
          <Card.Title className="text-lg font-semibold">Cupons</Card.Title>
          <Ticket size={18} className="text-muted" aria-hidden="true" />
        </div>
        <RangeTabs label="Período dos cupons" options={CARD_PERIODS} value={period} onChange={setPeriod} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ordenar cupons">
          {COUPON_SORTS.map((o) => (
            <Button key={o.id} size="sm" className="rounded-full" variant={sort === o.id ? "primary" : "tertiary"} onPress={() => setSort(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
        {data && (
          <p className="text-xs font-semibold text-muted">
            {fmtNum(data.totals.uses)} {data.totals.uses === 1 ? "uso" : "usos"} · {brl.format(data.totals.discountTotal)} em descontos
          </p>
        )}
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : !data ? (
          <p className="py-6 text-center text-sm font-medium text-muted">Carregando cupons</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Ticket className="text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhum cupom usado neste período</span>
          </div>
        ) : (
          <ul className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {items.map((c) => (
              <li key={c.couponId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-serif text-sm font-bold">{c.code}</span>
                    <Chip size="sm" variant="soft" color={c.archived ? "default" : "accent"}>
                      {c.discountType === "Percentage" ? `${fmtNum(c.discountValue)}%` : brl.format(c.discountValue)}
                    </Chip>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">
                    {sort === "uses" && `${fmtNum(c.uses)} ${c.uses === 1 ? "uso" : "usos"}`}
                    {sort === "discount" && brl.format(c.discountTotal)}
                    {sort === "average" && brl.format(c.averageDiscount)}
                  </span>
                </div>
                <ShareBar pct={maxMetric > 0 ? (metricOf(c) / maxMetric) * 100 : 0} />
                <p className="text-xs text-muted">
                  {fmtNum(c.uses)} {c.uses === 1 ? "uso" : "usos"} · {brl.format(c.discountTotal)} no total · média {brl.format(c.averageDiscount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ card: clientes que mais agendaram -------- */
const CUSTOMER_SORTS = [
  { id: "sessions", label: "Mais sessões" },
  { id: "spent", label: "Maior gasto" },
];

function TopCustomersCard({ tick }) {
  const [period, setPeriod] = useState("1M");
  const [sort, setSort] = useState("sessions");
  const { data, loading, error } = useInsight(`/admin/overview/top-customers?period=${period}&sort=${sort}`, tick);
  const items = data?.items ?? [];

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Card.Title className="text-lg font-semibold">Clientes que mais agendaram</Card.Title>
          <p className="text-xs font-semibold text-muted">Sessões no período, exceto canceladas</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <RangeTabs label="Período dos clientes" options={CARD_PERIODS} value={period} onChange={setPeriod} />
          <div className="flex gap-1" role="group" aria-label="Ordenar clientes">
            {CUSTOMER_SORTS.map((o) => (
              <Button key={o.id} size="sm" className="rounded-full" variant={sort === o.id ? "primary" : "tertiary"} onPress={() => setSort(o.id)}>
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : !data ? (
          <p className="py-6 text-center text-sm font-medium text-muted">Carregando clientes</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Trophy className="text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhuma sessão neste período</span>
          </div>
        ) : (
          <ol className={`flex flex-col gap-2 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {items.map((c) => (
              <li key={c.userId} className="flex items-center gap-3 rounded-xl bg-surface p-3">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center text-sm font-bold ${c.rank === 1 ? "text-warning" : "text-muted"}`}
                  aria-label={`${c.rank}º lugar`}
                >
                  {c.rank === 1 ? <Trophy size={18} aria-hidden="true" /> : c.rank}
                </span>
                <Avatar className="size-9 shrink-0">
                  <Avatar.Fallback>{initials(c.name)}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-muted">{c.email ?? "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {sort === "sessions" ? `${fmtNum(c.sessions)} ${c.sessions === 1 ? "sessão" : "sessões"}` : brl.format(c.spent)}
                  </p>
                  <p className="text-xs text-muted">
                    {sort === "sessions"
                      ? `${brl.format(c.spent)} gastos`
                      : `${fmtNum(c.sessions)} ${c.sessions === 1 ? "sessão" : "sessões"}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {data && data.totalCustomers > items.length && (
          <p className="mt-3 text-center text-xs text-muted">
            Top {items.length} de {fmtNum(data.totalCustomers)} clientes com sessões no período
          </p>
        )}
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
  const [tick, setTick] = useState(0); // sobe quando o tempo real avisa que algo mudou: cards e gráfico recarregam

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
    const onChange = () => {
      load();
      setTick((t) => t + 1);
    };
    const offStock = subscribeRealtime("stock-changed", onChange);
    const offAppointments = subscribeRealtime("appointments-changed", onChange);
    return () => {
      offStock();
      offAppointments();
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
            <ChartCard tick={tick} />
            <TopCustomersCard tick={tick} />
          </div>

          <div className="flex flex-col gap-6">
            <PendingRequestsCard requests={pending} busyId={busyId} onApprove={approve} onReject={setRejecting} />
            <StockAlertsCard products={products} />
            <CouponsCard tick={tick} />
          </div>
        </div>
      )}

      <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={load} />
    </div>
  );
}
