import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertDialog, Button, Link, Badge, Avatar, Chip, Toast, toast, } from '@heroui/react';
import { ChevronUp, ChevronDown, Eye, EyeOff, Play, UserX, CheckCheck, Undo2 } from "lucide-react";
import LiveClock from '../../../components/LiveClock';
import api from "../../../api/api";
import { useAuth } from "../../../context/AuthContext";
import { DayView, formatClock, useAppointments, notifyAppointmentsChanged } from '../Scheduling/Scheduling';
import { colorForAppointment } from '../Scheduling/schedulingConstants';
import SessionTable from "./SessionTable"
import KeyHint from '../../../components/KeyHint';

/* --------------------------- date/session utils -------------------------- */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Sessões que tocam o dia informado (mesma regra usada na MonthView da Agenda).
function appointmentsOnDay(appointments, day) {
  const dStart = startOfDay(day);
  const dEnd = addDays(dStart, 1);
  return appointments
    .filter((a) => a.start < dEnd && a.end > dStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function formatDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const formatBRL = (v) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MASK = "R$ ••••••";
// valor em R$ já considerando o botão de censura; null/undefined vira "—"
const moneyText = (v, hidden) => (v == null ? "—" : hidden ? MASK : formatBRL(v));

// agendamento que ainda "conta" no dia (cancelado e não compareceu não contam).
// Se o objeto da agenda não trouxer `status`, nada é filtrado.
const isActiveAppointment = (a) => a.status !== "Cancelled" && a.status !== "NoShow";

/* ------------------------------ hooks ------------------------------ */

// Timer compartilhado (atualiza a cada segundo) para saber a sessão ativa,
// a próxima sessão e o tempo restante em tempo real.
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Resumo financeiro do dia (GET /staff/day-summary). Recarrega quando a agenda
// muda (novo agendamento, status alterado, conclusão que baixa estoque etc.).
function useDaySummary(appointments) {
  const [summary, setSummary] = useState(null);
  // chave em texto: não dispara de novo se a lista for recriada com o mesmo conteúdo
  const key = useMemo(
    () => appointments.map((a) => `${a.id}|${a.status ?? ""}|${+a.start}|${+a.end}`).join(","),
    [appointments]
  );
  const refresh = useCallback(
    () =>
      api
        .get("/staff/day-summary")
        .then(setSummary)
        .catch((err) => console.error("Falha ao carregar o resumo do dia:", err)),
    []
  );

  useEffect(() => {
    refresh();
  }, [key, refresh]);

  // além de recarregar quando a agenda muda, confere de tempos em tempos
  // (cobre início/fim de atendimento feito em outro aparelho)
  useEffect(() => {
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  return [summary, refresh];
}

// Botão "olhinho": censura os valores em R$ da tela. A escolha fica salva neste navegador.
function useHideValues() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("staff-home:hide-values") === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem("staff-home:hide-values", next ? "1" : "0");
      } catch {
        /* sem storage: vale só até recarregar */
      }
      return next;
    });
  return [hidden, toggle];
}

/* --------------------------- Sessão atual card --------------------------- */
function ValueTile({ label, value, hidden, note, incomplete }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface px-3 py-2">
      <span className="block truncate text-xs font-semibold text-muted">{label}</span>
      <span className="block truncate text-base font-bold tabular-nums" title={incomplete ? "Há insumos sem custo cadastrado: valor parcial" : undefined}>
        {moneyText(value, hidden)}
        {incomplete && value != null && !hidden && <span className="text-warning">*</span>}
      </span>
      {note && !hidden && <span className="block truncate text-xs font-semibold text-muted">{note}</span>}
    </div>
  );
}

// Estados do atendimento (vêm de summary.byAppointment, montado pelo back):
// - EM ANDAMENTO: o profissional clicou em "Iniciar" (startedAt) e ainda não finalizou.
// - ATRASADA: o horário já passou e o atendimento NÃO foi iniciado (Agendado/Confirmado).
// Nada começa sozinho pelo relógio: só o botão inicia a sessão.
const OPEN_STATUSES = ["Scheduled", "Confirmed"];

function CurrentSessionCard({ appointments, now, summary, hidden, onChanged }) {
  const [busy, setBusy] = useState(null);
  // confirmação antes de finalizar (finalizar baixa o estoque e fecha o financeiro)
  const [confirmFinish, setConfirmFinish] = useState(false);

  const { inProgress, late, next } = useMemo(() => {
    const todays = appointmentsOnDay(appointments, now).filter((a) => summary?.byAppointment?.[a.id]);
    const meta = (a) => summary.byAppointment[a.id];
    const open = todays.filter((a) => OPEN_STATUSES.includes(meta(a).status));
    return {
      inProgress: open.find((a) => meta(a).startedAt) ?? null,
      late: open.filter((a) => !meta(a).startedAt && a.start <= now),
      next: open.find((a) => !meta(a).startedAt && a.start > now) ?? null,
    };
  }, [appointments, summary, now]);

  const lateFirst = late[0] ?? null;
  const active = inProgress ?? lateFirst;
  const isLate = !inProgress && !!lateFirst;

  async function run(kind, call, okMessage) {
    setBusy(kind);
    try {
      const res = await call();
      if (res?.stockWarnings?.length) {
        toast(
          `Faltou estoque: ${res.stockWarnings.map((w) => `${w.productName} (faltou ${w.missing})`).join(", ")}`,
          { variant: "warning" }
        );
      }
      toast.success(okMessage);
      notifyAppointmentsChanged(); // avisa agenda/DayView/tabela que o status mudou
      await onChanged();
    } catch (err) {
      toast.danger(err.message || "Não foi possível concluir a ação.");
    } finally {
      setBusy(null);
    }
  }

  // primeira carga do resumo: ainda não dá para saber quais sessões foram iniciadas
  if (!summary) {
    return <div className="flex h-full items-center justify-center p-4 text-sm font-semibold text-muted">Carregando sessão…</div>;
  }

  if (!active) {
    return (
      <div key="idle" className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <div className="container max-w-full">
          <div className="tumbleweed"></div>
        </div>
        <span className="font-bold text-surface-danger-foreground">Nenhuma sessão em andamento</span>
        {next ? (
          <span className="text-sm font-semibold text-muted/90">
            Próxima: <span className="font-medium text-foreground">{next.title}</span>
            {" - "}
            {formatClock(next.start)} • {formatClock(next.end)}
          </span>
        ) : (
          <span className="text-sm font-semibold text-muted ">Sem próximas sessões hoje</span>
        )}
      </div>
    );
  }

  const c = isLate ? null : colorForAppointment(active); // cor vem do status
  const dotColor = isLate ? "var(--danger)" : c.color;
  const money = summary?.byAppointment?.[active.id];
  const totalMs = active.end - active.start;
  const remainingMs = active.end - now;
  const overrun = !isLate && remainingMs < 0;
  const progressPct = Math.min(100, Math.max(0, ((now - active.start) / totalMs) * 100));
  const startFrom = next && !isLate ? next : null;

  return (
    <>
    <div key={active.id} className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="absolute h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
          <span className="relative h-2.5 w-2.5 rounded-full animate-ping" style={{ backgroundColor: dotColor }} />
          <span className="text-xs font-semibold uppercase tracking-wide" >{active.code}</span>
          <span className={`text-xs font-semibold uppercase tracking-wide ${isLate ? "text-danger" : "text-muted"}`}>
            {isLate ? "Sessão atrasada" : "Sessão atual"}
          </span>
          {isLate && late.length > 1 && (
            <Chip size="sm" variant="soft" color="danger">+{late.length - 1} atrasada{late.length > 2 ? "s" : ""}</Chip>
          )}
        </div>
        <h1 className="mt-1 text-xl font-bold truncate">{active.title}</h1>
        {active.clientName && <p className="text-md font-semibold text-muted mb-1">{active.clientName}</p>}
        <p className="text-sm font-semibold text-muted">{formatClock(active.start)} • {formatClock(active.end)}</p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <ValueTile
            label="Valor cobrado"
            value={money?.charged}
            hidden={hidden}
            note={money?.discount > 0 ? `cupom −${formatBRL(money.discount)}` : undefined}
          />
          <ValueTile
            label={money?.suppliesEstimated ? "Insumos (previsto)" : "Insumos usados"}
            value={money?.suppliesCost}
            hidden={hidden}
            incomplete={money ? !money.suppliesComplete : false}
          />
        </div>
      </div>

      <div className="mt-auto">
        {isLate ? (
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
            <span>Horário previsto já passou</span>
            <span className="text-danger">atrasada há {formatDuration(now - active.start)}</span>
          </div>
        ) : (
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
              <span>{overrun ? "Passou do horário há" : "Termina em"}</span>
              <span className={overrun ? "text-danger" : "text-foreground"}>
                {formatDuration(Math.abs(remainingMs))}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: overrun ? "var(--danger)" : c.color }}
              />
            </div>
          </div>
        )}

        {/* ações rápidas */}
        <div className="flex flex-wrap gap-2">
          {isLate ? (
            <>
              <Button
                size="sm"
                variant="primary"
                className="flex-1"
                isPending={busy === "start"}
                isDisabled={!!busy && busy !== "start"}
                onPress={() => run("start", () => api.post(`/appointments/${active.id}/start`, {}), "Atendimento iniciado.")}
              >
                <Play size={14} /> Iniciar atendimento
              </Button>
              <Button
                size="sm"
                variant="danger-soft"
                isPending={busy === "noshow"}
                isDisabled={!!busy && busy !== "noshow"}
                onPress={() => run("noshow", () => api.put(`/appointments/${active.id}`, { status: "NoShow" }), "Marcado como não compareceu.")}
              >
                <UserX size={14} /> Não compareceu
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="primary"
                className="flex-1"
                isPending={busy === "finish"}
                isDisabled={!!busy && busy !== "finish"}
                onPress={() => setConfirmFinish(true)}
              >
                <CheckCheck size={14} /> Finalizar atendimento
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isPending={busy === "undo"}
                isDisabled={!!busy && busy !== "undo"}
                onPress={() => run("undo", () => api.post(`/appointments/${active.id}/start`, { started: false }), "Início desfeito.")}
              >
                <Undo2 size={14} /> Desfazer início
              </Button>
            </>
          )}
        </div>

        {startFrom && (
          <div className="mt-2 border-t border-border pt-2 text-xs font-semibold text-muted">
            Próxima: <span className="font-medium text-foreground">{startFrom.title}</span>
            {" - "}
            {formatClock(startFrom.start)} • {formatClock(startFrom.end)}
          </div>
        )}
      </div>
    </div>

    {/* confirmação de "Finalizar atendimento" */}
    <AlertDialog isOpen={confirmFinish} onOpenChange={setConfirmFinish}>
      {/* o AlertDialog do HeroUI ignora o Esc por padrão; aqui o Esc cancela, como nos demais modais */}
      <AlertDialog.Backdrop variant="blur" isKeyboardDismissDisabled={false}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="max-w-[calc(100vw-2rem)] sm:max-w-115 border-6">
            <AlertDialog.Header className="items-center">
              <AlertDialog.Icon status="success" className="size-15">
                <CheckCheck className="size-8" />
              </AlertDialog.Icon>
              <AlertDialog.Heading>Finalizar atendimento</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-center text-sm font-semibold leading-5 text-muted">
                Deseja finalizar o atendimento
                <span className="block font-bold text-foreground">{active.title}</span>
                {active.clientName && <span className="block">de {active.clientName}</span>}
              </p>
              <p className="mt-3 text-center text-xs font-semibold leading-4 text-muted">
                Os insumos da receita serão baixados do estoque e o valor entra no financeiro de hoje.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" className="w-full">
                Cancelar
                <KeyHint>Esc</KeyHint>
              </Button>
              {/* autoFocus: o Enter já confirma, então a dica ↵ é verdadeira */}
              <Button
                slot="close"
                variant="primary"
                className="w-full"
                autoFocus
                onPress={() => run("finish", () => api.put(`/appointments/${active.id}`, { status: "Completed" }), "Atendimento finalizado.")}
              >
                Finalizar
                <KeyHint keyValue="enter" onFilled />
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
    </>
  );
}

/* --------------------------------- KPI cards -------------------------------- */

// Total/concluídas/pendentes de hoje + variação em relação ao MESMO dia da semana
// passada (o número de comparação vem do back, em `summary.sessions.compare`).
// Cancelados e "não compareceu" não entram. Sem base de comparação (0 sessões
// na semana passada, ou resumo ainda carregando) não mostra percentual.
function useDayStats(appointments, now, summary) {
  const todays = useMemo(
    () => appointmentsOnDay(appointments, now).filter(isActiveAppointment),
    [appointments, now]
  );
  const total = todays.length;
  // concluída = status "Finalizado" (é o que fecha o financeiro e baixa o estoque)
  const completed = Math.min(total, summary?.completedCount ?? 0);
  const pending = total - completed;

  const compare = summary?.sessions?.compare ?? 0;
  const diffPct = compare > 0 ? ((total - compare) / compare) * 100 : null;
  const showChip = diffPct !== null;
  const isUp = (diffPct ?? 0) >= 0;

  return { total, completed, pending, diffPct, isUp, showChip, compare };
}

// Card individual de KPI, no estilo "label em cima / número + chip embaixo".
function KpiCard({ label, value, chip }) {
  return (
    <div className="flex h-full min-h-20 w-full min-w-0 flex-col justify-between gap-1 rounded-xl bg-surface p-3 sm:p-4">
      <span className="truncate text-xs font-semibold text-muted sm:text-sm">{label}</span>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xl font-bold tabular-nums sm:text-2xl">{value}</span>
        {chip}
      </div>
    </div>
  );
}

// Chip de variação. `invert`: para custos, subir é ruim (vermelho) e cair é bom.
function DeltaChip({ change, invert = false }) {
  if (change == null) return null;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <Chip size="sm" variant="soft" color={change === 0 ? "default" : good ? "success" : "danger"}>
      {change !== 0 && (up ? <ChevronUp size={14} /> : <ChevronDown size={14} />)} {Math.abs(change).toFixed(0)}%
    </Chip>
  );
}

// Box 2: financeiro do dia (entradas = faturamento, saídas = insumos, líquido)
function FinanceCard({ summary, hidden, onToggle, unfinished = 0 }) {
  const items = [
    { key: "revenue", label: "Entradas", title: "Faturamento dos atendimentos concluídos hoje" },
    { key: "supplies", label: "Saídas", invert: true, title: "Custo dos insumos consumidos hoje" },
    { key: "net", label: "Líquido", title: "Entradas − Saídas" },
  ];
  const weekday = summary
    ? new Date(summary.date).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Bahia" })
    : "";

  return (
    <div className="col-span-3 flex min-w-0 flex-col gap-1.5 rounded-xl bg-overlay p-2">
      <div className="flex min-h-7 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-muted">Financeiro de hoje</span>
          {unfinished > 0 && (
            <span title="Só atendimentos com status Finalizado entram em Entradas e Saídas. Marque estas sessões como Finalizado na agenda.">
              <Chip size="sm" variant="soft" color="warning">
                {unfinished} sem finalizar
              </Chip>
            </span>
          )}
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          className="h-7 w-7 min-w-0"
          aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
          aria-pressed={hidden}
          onPress={onToggle}
        >
          {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5">
        {items.map((it) => {
          const m = summary?.[it.key];
          return (
            <div key={it.key} className="flex min-w-0 flex-col justify-between rounded-lg bg-surface p-1.5 sm:p-2" title={it.title}>
              <span className="truncate text-xs font-semibold text-muted">{it.label}</span>
              <span className="truncate text-sm font-bold tabular-nums sm:text-base">{summary ? moneyText(m.value, hidden) : "…"}</span>
              <span className="h-6" title={m ? `vs. ${weekday} passada: ${hidden ? MASK : formatBRL(m.compare)}` : undefined}>
                {summary && !hidden && <DeltaChip change={m.change} invert={it.invert} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------- Home ---------------------------------- */
const Home = () => {
  const { user } = useAuth();
  const appointments = useAppointments();
  const now = useNow();
  const [summary, refreshSummary] = useDaySummary(appointments);
  const [hidden, toggleHidden] = useHideValues();
  const { total, completed, pending, diffPct, isUp, showChip, compare } = useDayStats(appointments, now, summary);
  // sessões cujo horário de término já passou e que não estão "Finalizado":
  // enquanto isso não muda, elas não entram em Entradas/Saídas
  const unfinished = useMemo(() => {
    if (!summary) return 0;
    return appointmentsOnDay(appointments, now).filter((a) => {
      const m = summary.byAppointment?.[a.id];
      return m && m.status !== "Completed" && a.end <= now;
    }).length;
  }, [appointments, summary, now]);

  // bate com o default do próprio LiveClock (withSeconds = true) enquanto
  // a preferência do staff ainda não carregou
  const showClockSeconds = user?.settings?.showClockSeconds ?? true;

  return (
    <div className="w-full min-w-0">
      <header>
        {/* até xl: relógio e financeiro em linhas próprias + 3 KPIs; xl+: tudo numa linha só */}
        <div className="relative grid w-full grid-cols-3 gap-2 rounded-2xl bg-background p-1 xl:h-40 xl:grid-cols-9">

          {/* CLOCK */}
          <div className="col-span-3 flex h-32 w-full items-center justify-center overflow-hidden rounded-xl sm:h-36 xl:h-full">
            <LiveClock withSeconds={showClockSeconds} />
          </div>

          {/* BOX 2 */}
          <FinanceCard summary={summary} hidden={hidden} onToggle={toggleHidden} unfinished={unfinished} />

          {/* KPI: 3 cards independentes */}
          <KpiCard
            label="Hoje"
            value={total}
            chip={
              showChip && (
                <span title={`Mesmo dia da semana passada: ${compare} sessão(ões)`}>
                  <Chip size="sm" variant="soft" color={Math.round(diffPct) === 0 ? "default" : isUp ? "success" : "danger"}>
                    {Math.round(diffPct) !== 0 && (isUp ? <ChevronUp size={14} /> : <ChevronDown size={14} />)} {Math.abs(diffPct).toFixed(0)}%
                  </Chip>
                </span>
              )
            }
          />
          <KpiCard label="Concluídas" value={completed} />
          <KpiCard label="Pendentes" value={pending} />
        </div>
      </header>

      {/* agenda do dia e sessão atual: lado a lado só em telas largas */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-80 min-w-0 rounded-2xl bg-background">
          <DayView date={new Date()} appointments={appointments} />
        </div>

        <div className="min-h-80 min-w-0 rounded-2xl bg-background p-1 lg:h-80">
          <div className="h-full min-h-78 overflow-hidden rounded-2xl bg-overlay">
            <CurrentSessionCard appointments={appointments} now={now} summary={summary} hidden={hidden} onChanged={refreshSummary} />
          </div>
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <SessionTable appointments={appointments} />
      </div>
    </div>
  )
}

export default Home
