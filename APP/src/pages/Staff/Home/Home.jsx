import React, { useEffect, useMemo, useState } from 'react'
import { Button, Link, Badge, Avatar, Chip, Toast, toast, } from '@heroui/react';
import { ChevronUp, ChevronDown,  } from "lucide-react";
import LiveClock from '../../../components/LiveClock';
import { useAuth } from "../../../context/AuthContext";
import { DayView, formatClock, useAppointments, colorMap } from '../Scheduling/Scheduling';
import SessionTable from "./SessionTable"

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

/* --------------------------- Sessão atual card --------------------------- */
function CurrentSessionCard({ appointments, now }) {
  const todays = useMemo(() => appointmentsOnDay(appointments, now), [appointments, now]);
  const active = todays.find((a) => a.start <= now && a.end > now);
  const next = todays.find((a) => a.start > now);
  const c = active ? (colorMap[active.color] ?? colorMap.blue) : null;

  if (!active) {
    return (
      <div key="idle" className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <div className="container w-100">
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

  const remainingMs = active.end - now;
  const totalMs = active.end - active.start;
  const progressPct = Math.min(100, Math.max(0, ((now - active.start) / totalMs) * 100));

  return (
    <div key={active.id} className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="absolute h-2.5 w-2.5 rounded-full " style={{ backgroundColor: c.color, outlineColor: `${c.color}30`, }} />
          <span className="relative h-2.5 w-2.5 rounded-full animate-ping" style={{ backgroundColor: c.color, outlineColor: `${c.color}30`, }} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Sessão atual</span>
        </div>
        <h1 className="mt-1 text-xl font-bold truncate">{active.title}</h1>
        {active.clientName && (
          <p className="text-md font-semibold text-muted mb-2">{active.clientName}</p>
        )}
        <p className="text-sm font-semibold text-muted">{formatClock(active.start)} • {formatClock(active.end)}</p>
      </div>

      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between font-semibold text-xs text-muted">
          <span>Termina em</span>
          <span className="text-foreground">{formatDuration(remainingMs)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progressPct}%`, backgroundColor: c.color }}
          />
        </div>

        {next && (
        <div className="mt-2 border-t border-border pt-2 text-xs font-semibold text-muted">
          Próxima: <span className="font-medium text-foreground">{next.title}</span>
          {" - "}
          {formatClock(next.start)} • {formatClock(next.end)}
        </div>
      )}
      </div>
    </div>
  );
}

/* --------------------------------- KPI cards -------------------------------- */

// Calcula total/concluídas/pendentes de hoje + variação vs média dos 3 dias anteriores.
function useDayStats(appointments, now) {
  const todays = useMemo(() => appointmentsOnDay(appointments, now), [appointments, now]);
  const total = todays.length;
  const completed = todays.filter((a) => a.end <= now).length;
  const pending = total - completed;

  const avgPrev3 = useMemo(() => {
    const counts = [1, 2, 3].map(
      (n) => appointmentsOnDay(appointments, addDays(startOfDay(now), -n)).length
    );
    return counts.reduce((s, v) => s + v, 0) / 3;
  }, [appointments, now]);

  const diffPct = avgPrev3 > 0 ? ((total - avgPrev3) / avgPrev3) * 100 : total > 0 ? 100 : 0;
  const isUp = diffPct >= 0;
  const showChip = avgPrev3 > 0 || total > 0;

  return { total, completed, pending, diffPct, isUp, showChip };
}

// Card individual de KPI, no estilo "label em cima / número + chip embaixo".
function KpiCard({ label, value, chip }) {
  return (
    <div className="flex h-full w-full flex-col justify-between rounded-xl bg-surface p-4">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {chip}
      </div>
    </div>
  );
}

/* ---------------------------------- Home ---------------------------------- */
const Home = () => {
  const { user } = useAuth();
  const appointments = useAppointments();
  const now = useNow();
  const { total, completed, pending, diffPct, isUp, showChip } = useDayStats(appointments, now);

  // bate com o default do próprio LiveClock (withSeconds = true) enquanto
  // a preferência do staff ainda não carregou
  const showClockSeconds = user?.settings?.showClockSeconds ?? true;

  return (
    <div className="-pr-8">
      <header>
        <div className="relative grid grid-cols-9 h-40 w-full bg-background rounded-2xl gap-2 p-1">

          {/* CLOCK */}
          <div className="flex col-span-3 h-full w-full justify-center overflow-hidden items-center rounded-xl">
            <LiveClock withSeconds={showClockSeconds} />
          </div>

          {/* BOX 2 */}
          <div className="col-span-3 bg-overlay rounded-xl p-2"><h1>Box 2</h1></div>

          {/* KPI: 3 cards independentes */}
          <KpiCard
            label="Hoje"
            value={total}
            chip={
              showChip && (
                <Chip size="sm" variant="soft" color={isUp ? "success" : "danger"}>
                  {isUp ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {Math.abs(diffPct).toFixed(0)}%
                </Chip>
              )
            }
          />
          <KpiCard label="Concluídas" value={completed} />
          <KpiCard label="Pendentes" value={pending} />
        </div>
      </header>

      <div className="grid grid-cols-2 mt-4 gap-4">
        <div className='h-80 bg-background rounded-2xl'>
          <DayView date={new Date()} />
        </div>

        <div className="h-80 bg-background rounded-2xl p-1">
          <div className="bg-overlay h-full rounded-2xl overflow-hidden">
            <CurrentSessionCard appointments={appointments} now={now} />
          </div>
        </div>
      </div>

      <div className=" mt-4 gap-4">
        <div className='h-65 bg-overlay rounded-2xl'>
          <SessionTable appointments={appointments} />
        </div>
        
      </div>
    </div>
  )
}

export default Home
