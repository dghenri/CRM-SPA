import { useEffect, useState } from "react";
import { Avatar, Button, Card, ListBox, Select } from "@heroui/react";
import {
  CalendarCheck,
  Receipt,
  TrendingDown,
  UserX,
  UsersRound,
  Wallet,
  XCircle,
} from "lucide-react";
import api, { assetUrl } from "../../../api/api";
import { subscribeRealtime } from "../../../realtime/socket";

const PERIODS = [
  { id: "1W", label: "7 dias" },
  { id: "1M", label: "30 dias" },
  { id: "3M", label: "90 dias" },
  { id: "1Y", label: "12 meses" },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = (value) => Number(value ?? 0).toLocaleString("pt-BR");
const percentage = (value) => `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

function MetricCard({ title, value, icon: Icon, detail }) {
  return (
    <Card className="rounded-2xl bg-surface-secondary">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title className="text-sm font-medium text-muted">{title}</Card.Title>
        <Icon size={18} className="text-muted" aria-hidden="true" />
      </Card.Header>
      <Card.Content className="gap-1">
        <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</span>
        {detail && <span className="text-xs font-medium text-muted">{detail}</span>}
      </Card.Content>
    </Card>
  );
}

function TrendChart({ series, period }) {
  const maximum = Math.max(1, ...series.map((item) => item.completed + item.cancelled + item.noShow));
  const labelStep = period === "1M" ? 5 : 1;

  if (!series.length || series.every((item) => item.completed + item.cancelled + item.noShow === 0)) {
    return <p className="py-10 text-center text-sm font-medium text-muted">Ainda não há atendimentos neste período.</p>;
  }

  return (
    <>
      <div className="flex items-end gap-1 overflow-x-auto pb-2" role="list" aria-label="Atendimentos por período">
        {series.map((item, index) => {
          const total = item.completed + item.cancelled + item.noShow;
          const height = total ? Math.max(4, (total / maximum) * 112) : 0;
          const cancelledHeight = total ? (item.cancelled / total) * height : 0;
          const noShowHeight = total ? (item.noShow / total) * height : 0;
          const completedHeight = Math.max(0, height - cancelledHeight - noShowHeight);
          const description =
            `${item.label}: ${number(item.completed)} concluídos, ` +
            `${number(item.cancelled)} cancelados e ${number(item.noShow)} faltas`;

          return (
            <div
              key={item.key}
              role="listitem"
              aria-label={description}
              title={description}
              className="flex min-w-5 flex-1 flex-col items-center justify-end gap-2"
            >
              <div className="flex h-28 w-full items-end justify-center">
                <div className="flex w-3/4 max-w-7 flex-col-reverse overflow-hidden rounded-t-sm">
                  <div className="bg-accent" style={{ height: completedHeight }} />
                  <div className="bg-danger" style={{ height: cancelledHeight }} />
                  <div className="bg-warning" style={{ height: noShowHeight }} />
                </div>
              </div>
              <span className="h-4 whitespace-nowrap text-[10px] text-muted">
                {index % labelStep === 0 || index === series.length - 1 ? item.label : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted" aria-label="Legenda">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" />Concluídos</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger" />Cancelados</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning" />Faltas</span>
      </div>
    </>
  );
}

function StaffRow({ member }) {
  const statusLabel = { Active: "Ativo", OnLeave: "Afastado", Inactive: "Inativo" }[member.status] ?? member.status;

  return (
    <tr className="border-t border-border/70">
      <th scope="row" className="min-w-52 px-3 py-3 text-left font-medium">
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            {member.avatarUrl && <Avatar.Image alt="" src={assetUrl(member.avatarUrl)} />}
            <Avatar.Fallback>{initials(member.name) || "?"}</Avatar.Fallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{member.name}</span>
            <span className="text-xs font-normal text-muted">
              {member.profession ? `${member.profession} · ${statusLabel}` : statusLabel}
            </span>
          </span>
        </div>
      </th>
      <td className="px-3 py-3 text-right tabular-nums">{number(member.completed)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{number(member.cancelled)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{number(member.noShow)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{percentage(member.cancellationRate)}</td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums">{brl.format(member.revenue)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{brl.format(member.averageTicket)}</td>
    </tr>
  );
}

export default function StaffPerformance() {
  const [period, setPeriod] = useState("1M");
  const [trendStaffId, setTrendStaffId] = useState("team");
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => subscribeRealtime("appointments-changed", () => setRefresh((value) => value + 1)), []);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    const staffFilter = trendStaffId === "team" ? "" : `&staffId=${encodeURIComponent(trendStaffId)}`;
    api.get(`/staff/performance?period=${period}${staffFilter}`)
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        console.error("Falha ao carregar a progressão dos funcionários:", error);
        if (active) setState((previous) => ({
          ...previous,
          loading: false,
          error: error.message || "Não foi possível carregar os indicadores.",
        }));
      });

    return () => {
      active = false;
    };
  }, [period, refresh, trendStaffId]);

  const summary = state.data?.summary;
  const selectedPeriod = PERIODS.find((item) => item.id === period)?.label;
  const subject = state.data?.canCompareTeam ? "equipe" : "você";
  const trendStaff = state.data?.staff.find((member) => member.id === state.data?.trendStaffId);
  const trendLabel = state.data?.canCompareTeam
    ? trendStaff ? `Atendimentos de ${trendStaff.name}` : "Atendimentos da equipe"
    : "Seus atendimentos";

  return (
    <main className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progressão do funcionário</h1>
          <p className="mt-1 text-sm text-muted">
            Acompanhe atendimentos, desfechos e receita por período.
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Período dos indicadores">
          {PERIODS.map((item) => (
            <Button
              key={item.id}
              size="sm"
              className="rounded-full"
              variant={period === item.id ? "primary" : "tertiary"}
              aria-pressed={period === item.id}
              onPress={() => setPeriod(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </header>

      {state.error && !state.data && (
        <Card className="rounded-2xl border border-danger/30 bg-danger/5">
          <Card.Content>
            <p role="alert" className="py-4 text-center text-sm font-semibold text-danger">{state.error}</p>
          </Card.Content>
        </Card>
      )}

      <section
        aria-label="Indicadores do período"
        aria-busy={state.loading}
        className={`grid gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${state.loading && state.data ? "opacity-60" : ""}`}
      >
        <MetricCard title="Atendimentos concluídos" value={summary ? number(summary.completed) : "—"} icon={CalendarCheck} detail={selectedPeriod} />
        <MetricCard title="Cancelamentos" value={summary ? number(summary.cancelled) : "—"} icon={XCircle} detail={selectedPeriod} />
        <MetricCard title="Faltas" value={summary ? number(summary.noShow) : "—"} icon={UserX} detail={selectedPeriod} />
        <MetricCard title="Pacientes atendidos" value={summary ? number(summary.customers) : "—"} icon={UsersRound} detail="Pacientes únicos" />
        <MetricCard title="Taxa de não conclusão" value={summary ? percentage(summary.cancellationRate) : "—"} icon={TrendingDown} detail="Cancelamentos + faltas" />
        <MetricCard title="Receita realizada" value={summary ? brl.format(summary.revenue) : "—"} icon={Wallet} detail="Atendimentos concluídos" />
        <MetricCard title="Ticket médio" value={summary ? brl.format(summary.averageTicket) : "—"} icon={Receipt} detail="Receita por atendimento concluído" />
      </section>

      {state.error && state.data && (
        <p role="alert" className="text-sm font-semibold text-danger">{state.error} Os dados exibidos podem estar desatualizados.</p>
      )}

      {state.data && (
        <>
          <p className="text-xs font-medium text-muted">
            Avaliações de pacientes ainda não são registradas. A receita usa o preço atual do procedimento e os descontos registrados.
          </p>

          <Card className={`rounded-2xl bg-surface-secondary ${state.loading ? "opacity-60" : ""}`}>
            <Card.Header className="flex-row items-center justify-between">
              <div className="min-w-0">
                <Card.Title className="text-lg font-semibold">Evolução de atendimentos</Card.Title>
                <p className="mt-1 text-xs text-muted">
                  {trendLabel} — {selectedPeriod}
                </p>
              </div>
              {state.data.canCompareTeam ? (
                <Select
                  aria-label="Funcionário da evolução"
                  className="w-full sm:w-56"
                  selectedKey={trendStaffId}
                  onSelectionChange={(key) => setTrendStaffId(key ?? "team")}
                >
                  <Select.Trigger className="border border-border bg-background">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="team" textValue="Equipe">
                        Equipe
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {state.data.staff.map((member) => (
                        <ListBox.Item key={member.id} id={member.id} textValue={member.name}>
                          {member.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              ) : <TrendingDown size={18} className="text-muted" aria-hidden="true" />}
            </Card.Header>
            <Card.Content>
              <TrendChart series={state.data.series ?? []} period={period} />
            </Card.Content>
          </Card>

          {state.data.canCompareTeam && (
            <Card className={`rounded-2xl bg-surface-secondary ${state.loading ? "opacity-60" : ""}`}>
              <Card.Header className="flex-row items-center justify-between">
                <div>
                  <Card.Title className="text-lg font-semibold">Desempenho da equipe</Card.Title>
                  <p className="mt-1 text-xs text-muted">Comparativo de {state.data.staff.length} funcionários nos últimos {selectedPeriod}</p>
                </div>
                <UsersRound size={18} className="text-muted" aria-hidden="true" />
              </Card.Header>
              <Card.Content className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-sm">
                    <caption className="sr-only">Indicadores de desempenho por funcionário no período selecionado</caption>
                    <thead>
                      <tr className="text-xs text-muted">
                        <th scope="col" className="px-3 py-2 text-left font-semibold">Funcionário</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Concluídos</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Cancelados</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Faltas</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Não conclusão</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Receita</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Ticket médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.staff.map((member) => <StaffRow key={member.id} member={member} />)}
                    </tbody>
                  </table>
                </div>
                {state.data.staff.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted">Nenhum funcionário encontrado.</p>
                )}
              </Card.Content>
            </Card>
          )}
        </>
      )}

      {!state.data && state.loading && (
        <p className="py-12 text-center text-sm font-medium text-muted">Carregando indicadores de {subject}...</p>
      )}
    </main>
  );
}
