import { useEffect, useState } from "react";
import { Button, Card, Chip, Modal, toast } from "@heroui/react";
import {
  Banknote,
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileDown,
  Receipt,
  Store,
  Ticket,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import api from "../../../api/api";
import { PAYMENT_METHODS } from "../../../components/paymentMethods";
import { subscribeRealtime } from "../../../realtime/socket";
import KeyHint, { confirmOnEnter } from "../../../components/KeyHint";

/* ---------------------------------------------------------------------------
 * Página "Receita" (todos os cargos de staff). Mesmas regras do Overview:
 *  - receita realizada = atendimentos concluídos (Completed);
 *  - líquida = preço do serviço - cupons usados (é o que o gráfico do Overview soma);
 *  - prevista = agendados/confirmados de hoje em diante.
 * Rotas: /staff/revenue/* (summary, chart, payment-methods, services, transactions).
 * ------------------------------------------------------------------------- */

/* ------------------------------ formatação ------------------------------- */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtNum = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtPercent = (n) => `${Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const plural = (n, one, many) => `${fmtNum(n)} ${Number(n) === 1 ? one : many}`;

/* ------------------------------ formas de pagamento ---------------------- */
// "None" = atendimentos sem forma de pagamento informada (antigos / avulsos)
const METHOD_META = {
  ...Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, { label: m.label, icon: m.icon }])),
  None: { label: "Não informado", icon: CircleHelp },
};
const METHOD_COLOR = {
  Pix: "bg-accent",
  CreditCard: "bg-success",
  DebitCard: "bg-warning",
  Cash: "bg-foreground/60",
  None: "bg-default",
};
const methodMeta = (id) => METHOD_META[id ?? "None"] ?? METHOD_META.None;
const methodColor = (id) => METHOD_COLOR[id ?? "None"] ?? METHOD_COLOR.None;

const PAYMENT_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "Pix", label: "Pix" },
  { id: "CreditCard", label: "Crédito" },
  { id: "DebitCard", label: "Débito" },
  { id: "Cash", label: "Dinheiro" },
];

/* ------------------------------ períodos --------------------------------- */
// `id` é o que a API entende (não mude); `label` é o que aparece na tela
const PERIODS = [
  { id: "1W", label: "1S", title: "últimos 7 dias" },
  { id: "1M", label: "1M", title: "últimos 30 dias" },
  { id: "3M", label: "3M", title: "últimos 90 dias" },
  { id: "1Y", label: "1A", title: "últimos 12 meses" },
  { id: "ALL", label: "Tudo", title: "todo o período" },
];

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

/* ------------------------------ busca de dados --------------------------- */
// `tick` muda quando o tempo real avisa que algo mudou. Mantém o dado anterior
// na tela enquanto recarrega (sem piscar).
function useInsight(path, tick) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    api
      .get(path)
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

/* ------------------------------ cards de KPI ----------------------------- */
// goodWhen: se subir é bom ("up") ou ruim ("down") - define a cor da variação
const KPI_CARDS = [
  { key: "net", title: "Receita líquida", icon: Wallet, format: (v) => brl.format(v), goodWhen: "up" },
  { key: "gross", title: "Receita bruta", icon: Banknote, format: (v) => brl.format(v), goodWhen: "up" },
  { key: "discount", title: "Descontos de cupons", icon: Ticket, format: (v) => brl.format(v), goodWhen: "down" },
  { key: "sessions", title: "Sessões concluídas", icon: CalendarCheck, format: (v) => fmtNum(v), goodWhen: "up" },
  { key: "averageTicket", title: "Ticket médio", icon: Receipt, format: (v) => brl.format(v), goodWhen: "up" },
];

function Change({ change, goodWhen }) {
  if (change == null) return <span className="text-xs font-semibold text-muted">Sem base de comparação</span>;
  if (change === 0) return <span className="text-xs font-semibold text-muted">Sem variação vs período anterior</span>;

  const isGood = (change > 0) === (goodWhen === "up");
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${isGood ? "text-success" : "text-danger"}`}>
      <Icon size={14} aria-hidden="true" />
      {change > 0 ? "+" : "−"}
      {Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      <span className="font-semibold text-muted">vs período anterior</span>
    </span>
  );
}

function KpiCard({ title, icon: Icon, value, footer }) {
  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title className="text-sm font-medium text-muted">{title}</Card.Title>
        <Icon size={18} className="text-muted" aria-hidden="true" />
      </Card.Header>
      <Card.Content className="gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        {footer}
      </Card.Content>
    </Card>
  );
}

function SummaryCards({ tick, period }) {
  const { data, error } = useInsight(`/staff/revenue/summary?period=${period}`, tick);

  if (error && !data) {
    return (
      <Card className="rounded-2xl bg-surface-secondary">
        <Card.Content>
          <CardError message={error} />
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {KPI_CARDS.map((config) => {
        const card = data?.cards?.[config.key];
        return (
          <KpiCard
            key={config.key}
            title={config.title}
            icon={config.icon}
            value={card ? config.format(card.value) : "—"}
            footer={card ? <Change change={card.change} goodWhen={config.goodWhen} /> : null}
          />
        );
      })}
      <KpiCard
        title="Receita prevista"
        icon={CalendarClock}
        value={data ? brl.format(data.forecast.value) : "—"}
        footer={
          data && (
            <span className="text-xs font-semibold text-muted">
              {plural(data.forecast.sessions, "sessão agendada", "sessões agendadas")} daqui pra frente
            </span>
          )
        }
      />
    </div>
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
    label: "Receita líquida",
    full: (v) => brl.format(v),
    axis: (v) => (v === 0 ? "0" : brlCompact.format(v)),
  },
  sessions: {
    label: "Sessões",
    full: (v) => plural(v, "sessão", "sessões"),
    axis: (v) => fmtNum(Math.round(v * 10) / 10),
  },
};

function BarChart({ series, metric, title }) {
  const [active, setActive] = useState(null);
  const m = METRICS[metric];
  const top = niceCeil(Math.max(0, ...series.map((s) => s[metric])));
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  // com muitas barras só alguns rótulos aparecem, sempre ancorados na última barra
  const labelStep = Math.max(1, Math.ceil(series.length / 12));
  const dense = series.length > 14;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {/* eixo Y */}
        <div className="flex h-56 w-11 shrink-0 flex-col justify-between text-right text-[10px] text-muted sm:w-14 sm:text-xs" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="-my-1.5">
              {m.axis(top * t)}
            </span>
          ))}
        </div>

        {/* área do gráfico */}
        <div className="relative h-56 flex-1" role="group" aria-label={`${m.label}, ${title}`}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${t * 100}%` }} aria-hidden="true" />
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
        <div className="w-11 shrink-0 sm:w-14" />
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

function ChartCard({ tick, period }) {
  const [metric, setMetric] = useState("revenue");
  const { data, loading, error } = useInsight(`/staff/revenue/chart?range=${period}`, tick);
  const periodTitle = PERIODS.find((p) => p.id === period)?.title ?? "";

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Card.Title className="text-lg font-semibold">Desempenho</Card.Title>
          <p className="text-xs font-semibold text-muted first-letter:uppercase">{periodTitle}</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Métrica">
          {Object.entries(METRICS).map(([key, v]) => (
            <Button key={key} size="sm" className="rounded-full" variant={metric === key ? "primary" : "tertiary"} onPress={() => setMetric(key)}>
              {v.label}
            </Button>
          ))}
        </div>
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : data ? (
          <div className={`transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
            <BarChart series={data.series} metric={metric} title={periodTitle} />
          </div>
        ) : (
          <p className="py-24 text-center text-sm font-medium text-muted">Carregando gráfico</p>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ card: formas de pagamento ---------------- */
const METHOD_SORTS = [
  { id: "amount", label: "Maior valor" },
  { id: "sessions", label: "Mais sessões" },
];

function PaymentMethodsCard({ tick, period }) {
  const [sort, setSort] = useState("amount");
  const { data, loading, error } = useInsight(`/staff/revenue/payment-methods?period=${period}&sort=${sort}`, tick);
  const items = data?.items ?? [];
  const shareOf = (item) => (sort === "amount" ? item.shareAmount : item.shareSessions);

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-col items-stretch gap-2">
        <div className="flex items-center justify-between gap-2">
          <Card.Title className="text-lg font-semibold">Formas de pagamento</Card.Title>
          <Wallet size={18} className="text-muted" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ordenar formas de pagamento">
          {METHOD_SORTS.map((o) => (
            <Button key={o.id} size="sm" className="rounded-full" variant={sort === o.id ? "primary" : "tertiary"} onPress={() => setSort(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
        {data && (
          <p className="text-xs font-semibold text-muted">
            {brl.format(data.totals.net)} em {plural(data.totals.sessions, "sessão", "sessões")}
          </p>
        )}
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : !data ? (
          <p className="py-6 text-center text-sm font-medium text-muted">Carregando pagamentos</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Wallet className="text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhum atendimento concluído neste período</span>
          </div>
        ) : (
          <div className={`flex flex-col gap-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {/* distribuição geral */}
            <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-default" role="img" aria-label="Distribuição por forma de pagamento">
              {items.map((item) => (
                <div key={item.method} className={`h-full ${methodColor(item.method)}`} style={{ width: `${Math.max(shareOf(item), 1)}%` }} />
              ))}
            </div>

            <ul className="flex flex-col gap-4">
              {items.map((item) => {
                const { label, icon: Icon } = methodMeta(item.method);
                return (
                  <li key={item.method} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        <span className={`size-2.5 shrink-0 rounded-full ${methodColor(item.method)}`} aria-hidden="true" />
                        <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">
                        {sort === "amount" ? brl.format(item.net) : plural(item.sessions, "sessão", "sessões")}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-default" aria-hidden="true">
                      <div className={`h-full rounded-full ${methodColor(item.method)}`} style={{ width: `${Math.max(shareOf(item), 3)}%` }} />
                    </div>
                    <p className="text-xs text-muted">
                      {fmtPercent(shareOf(item))} · {brl.format(item.net)} · {plural(item.sessions, "sessão", "sessões")} · ticket {brl.format(item.averageTicket)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ card: receita por procedimento ----------- */
const SERVICE_SORTS = [
  { id: "revenue", label: "Maior receita" },
  { id: "sessions", label: "Mais sessões" },
];

function ServicesCard({ tick, period }) {
  const [sort, setSort] = useState("revenue");
  const { data, loading, error } = useInsight(`/staff/revenue/services?period=${period}&sort=${sort}`, tick);
  const items = data?.items ?? [];
  const maxMetric = Math.max(0, ...items.map((s) => (sort === "revenue" ? s.net : s.sessions)));

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-col items-stretch gap-2">
        <div className="flex items-center justify-between gap-2">
          <Card.Title className="text-lg font-semibold">Procedimentos</Card.Title>
          <Store size={18} className="text-muted" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ordenar procedimentos">
          {SERVICE_SORTS.map((o) => (
            <Button key={o.id} size="sm" className="rounded-full" variant={sort === o.id ? "primary" : "tertiary"} onPress={() => setSort(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : !data ? (
          <p className="py-6 text-center text-sm font-medium text-muted">Carregando procedimentos</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Store className="text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhum atendimento concluído neste período</span>
          </div>
        ) : (
          <ul className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {items.map((s) => {
              const metric = sort === "revenue" ? s.net : s.sessions;
              return (
                <li key={s.serviceId ?? "none"} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{s.title}</span>
                    <span className="shrink-0 text-sm font-semibold">
                      {sort === "revenue" ? brl.format(s.net) : plural(s.sessions, "sessão", "sessões")}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-default" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(maxMetric > 0 ? (metric / maxMetric) * 100 : 0, 3)}%` }} />
                  </div>
                  <p className="text-xs text-muted">
                    {fmtPercent(s.share)} da receita · {plural(s.sessions, "sessão", "sessões")} · {brl.format(s.gross)} bruto
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.totalServices > items.length && (
          <p className="mt-3 text-center text-xs text-muted">
            Top {items.length} de {fmtNum(data.totalServices)} procedimentos com atendimentos no período
          </p>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ card: transações ------------------------- */
function TransactionsCard({ tick, period }) {
  const [page, setPage] = useState(1);
  const [payment, setPayment] = useState("all");
  const query = new URLSearchParams({ period, page: String(page), limit: "10" });
  if (payment !== "all") query.set("payment", payment);
  const { data, loading, error } = useInsight(`/staff/revenue/transactions?${query}`, tick);
  const items = data?.items ?? [];

  const pickPayment = (id) => {
    setPayment(id);
    setPage(1);
  };

  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-col items-stretch gap-3">
        <div className="flex flex-col gap-0.5">
          <Card.Title className="text-lg font-semibold">Transações</Card.Title>
          <p className="text-xs font-semibold text-muted">Atendimentos concluídos, do mais recente ao mais antigo</p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por forma de pagamento">
          {PAYMENT_FILTERS.map((o) => (
            <Button key={o.id} size="sm" className="rounded-full" variant={payment === o.id ? "primary" : "tertiary"} onPress={() => pickPayment(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
      </Card.Header>
      <Card.Content>
        {error && !data ? (
          <CardError message={error} />
        ) : !data ? (
          <p className="py-6 text-center text-sm font-medium text-muted">Carregando transações</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Receipt className="text-muted" />
            <span className="text-sm font-semibold text-muted">Nenhuma transação neste período</span>
          </div>
        ) : (
          <>
          {/* celular: cartões (a tabela de 4 colunas não cabe) */}
          <ul className={`flex flex-col gap-2 transition-opacity md:hidden ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
            {items.map((t) => (
              <li key={t.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.customerName}</p>
                    <p className="truncate text-xs text-muted">
                      {t.serviceTitle} · <span className="font-serif font-bold">{t.code}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{brl.format(t.net)}</p>
                    {t.discount > 0 && <p className="text-xs text-muted">cupom −{brl.format(t.discount)}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>{fmtDateTime(t.date)}</span>
                  <Chip size="sm" variant="soft" color={t.paymentMethod ? "default" : "warning"}>
                    {methodMeta(t.paymentMethod).label}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>

          {/* tablet e desktop: tabela */}
          <div className={`hidden overflow-x-auto transition-opacity md:block ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
            <table className="w-full min-w-136 text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">Cliente</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Data</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Pagamento</th>
                  <th scope="col" className="py-2 pl-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{t.customerName}</p>
                      <p className="text-xs text-muted">
                        {t.serviceTitle} · <span className="font-serif font-bold">{t.code}</span>
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{fmtDateTime(t.date)}</td>
                    <td className="px-3 py-3">
                      <Chip size="sm" variant="soft" color={t.paymentMethod ? "default" : "warning"}>
                        {methodMeta(t.paymentMethod).label}
                      </Chip>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-3 text-right">
                      <p className="font-semibold">{brl.format(t.net)}</p>
                      {t.discount > 0 && <p className="text-xs text-muted">{brl.format(t.gross)} − cupom {brl.format(t.discount)}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {data && data.total > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Página {data.page} de {data.pages} · {plural(data.total, "transação", "transações")}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="tertiary" isIconOnly aria-label="Página anterior" isDisabled={page <= 1 || loading} onPress={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} />
              </Button>
              <Button size="sm" variant="tertiary" isIconOnly aria-label="Próxima página" isDisabled={page >= data.pages || loading} onPress={() => setPage((p) => p + 1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

/* ------------------------------ exportar relatório (PDF) ----------------- */
// Pergunta o período ANTES de montar o PDF. O PDF é gerado no navegador por
// revenueReport.js (carregado só neste momento, para não pesar a página).
function ExportModal({ isOpen, defaultPeriod, onClose }) {
  const [choice, setChoice] = useState(defaultPeriod);
  const [busy, setBusy] = useState(false);

  // a cada abertura começa no período que está na tela
  useEffect(() => {
    if (isOpen) setChoice(defaultPeriod);
  }, [isOpen, defaultPeriod]);

  async function generate() {
    setBusy(true);
    try {
      const { generateRevenueReport } = await import("./revenueReport");
      await generateRevenueReport({
        api,
        period: choice,
        periods: PERIODS,
        methodLabel: (id) => methodMeta(id).label,
      });
      toast.success("Relatório gerado. Confira seus downloads.");
      onClose();
    } catch (e) {
      toast.danger(e.message || "Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && !busy && onClose()}
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <Modal.Container size="md">
          <Modal.Dialog>
           <div className="contents" onKeyDown={confirmOnEnter(generate, busy)}>
            <Modal.Header>
              <Modal.Heading>Exportar relatório em PDF</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3 p-1">
                <p className="text-sm text-muted">De qual período você quer o relatório?</p>
                <div role="radiogroup" aria-label="Período do relatório" className="flex flex-col gap-2">
                  {PERIODS.map((p) => {
                    const selected = choice === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={busy}
                        onClick={() => setChoice(p.id)}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60 ${
                          selected ? "border-accent bg-accent/10" : "border-border hover:bg-default"
                        }`}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-accent" : "border-muted"
                          }`}
                          aria-hidden="true"
                        >
                          {selected && <span className="size-2 rounded-full bg-accent" />}
                        </span>
                        <span className="w-10 shrink-0 font-semibold">{p.label}</span>
                        <span className="text-muted first-letter:uppercase">{p.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={onClose} isDisabled={busy}>
                Cancelar
                <KeyHint>Esc</KeyHint>
              </Button>
              <Button onPress={generate} isPending={busy}>
                <FileDown size={16} aria-hidden="true" />
                Gerar PDF
                <KeyHint keyValue="enter" onFilled />
              </Button>
            </Modal.Footer>
           </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------ página ----------------------------------- */
export default function Revenue() {
  const [period, setPeriod] = useState("1M");
  const [exportOpen, setExportOpen] = useState(false);
  const [tick, setTick] = useState(0); // sobe quando o tempo real avisa que algo mudou: tudo recarrega

  // tempo real: atendimentos concluídos/alterados mudam os números
  useEffect(() => subscribeRealtime("appointments-changed", () => setTick((t) => t + 1)), []);

  const periodTitle = PERIODS.find((p) => p.id === period)?.title ?? "";

  return (
    <div className="flex flex-col gap-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Receita</h1>
          <p className="text-sm font-semibold text-muted">
            Atendimentos concluídos, <span>{periodTitle}</span>. O líquido já desconta os cupons usados.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-x-5 gap-y-2 sm:w-auto sm:justify-start">
          <Button size="sm" variant="tertiary" className="rounded-lg" onPress={() => setExportOpen(true)}>
            <FileDown size={16} aria-hidden="true" />
            Exportar PDF
          </Button>
          <RangeTabs label="Período da receita" options={PERIODS} value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <SummaryCards tick={tick} period={period} />
          <ChartCard tick={tick} period={period} />
          <TransactionsCard key={period} tick={tick} period={period} />
        </div>

        <div className="flex flex-col gap-6">
          <PaymentMethodsCard tick={tick} period={period} />
          <ServicesCard tick={tick} period={period} />
        </div>
      </div>

      <ExportModal isOpen={exportOpen} defaultPeriod={period} onClose={() => setExportOpen(false)} />
    </div>
  );
}
