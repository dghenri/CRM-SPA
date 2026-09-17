import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  ButtonGroup,
  AlertDialog,
  Input,
  Label,
  Separator,
  Dropdown,
  ColorSwatchPicker,
  parseColor,
  Tabs,
  Tooltip,
  CloseButton,
  Modal,
  DatePicker,
  DateField,
  Calendar,
  TimeField,
  Toast,
  toast,
  ComboBox,
  ListBox,
  Avatar,
  Popover,
  Select,
} from "@heroui/react";
import { parseDate, parseTime, today, getLocalTimeZone } from "@internationalized/date";
import {
  fetchSchedulingData,
  fetchAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  updateAppointmentStatus,
} from "../../../api/scheduling";
import { useAuth } from "../../../context/AuthContext";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Trash2,
  Pencil,
  Palette,
  Clock,
  Copy,
  Plus,
  MessageCircle,
  IdCardLanyard,
  UserRound,
} from "lucide-react";

/* ------------------------------- constants ------------------------------- */

const COLORS = [
  {
    id: "blue",
    color: "#3B82F6",
    bg: "bg-blue-500/25",
    border: "border-blue-500",
    soft: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  },
  {
    id: "violet",
    color: "#7239EE",
    bg: "bg-violet-500/25",
    border: "border-violet-500",
    soft: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  },
  {
    id: "emerald",
    color: "#10B981",
    bg: "bg-emerald-500/25",
    border: "border-emerald-500",
    soft: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  },
  { 
    id: "amber",
    color: "#F6CA2D",
    bg: "bg-amber-500/25",
    border: "border-amber-500",
    soft: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  { 
    id: "rose",
    color: "#F5749A",
    bg: "bg-rose-500/25",
    border: "border-rose-500",
    soft: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  },
  { 
    id: "slate",
    color: "#B2B1B8",
    bg: "bg-slate-500/25",
    border: "border-slate-500",
    soft: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  },
];

const colorMap = Object.fromEntries(COLORS.map((c) => [c.id, c]));
const hexById = Object.fromEntries(COLORS.map((c) => [c.id, c.color]));
const idByHex = Object.fromEntries(COLORS.map((c) => [c.color.toLowerCase(), c.id]));

const SLOT_MIN = 5;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
const TOTAL_SLOTS = 24 * SLOTS_PER_HOUR;
const SLOT_PX = 5;
const HOUR_PX = SLOT_PX * SLOTS_PER_HOUR;

/* ----------------------------- date utils ---------------------------- */

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
function addMinutes(d, n) {
  return new Date(d.getTime() + n * 60_000);
}
function startOfWeek(d) {
  const x = startOfDay(d);
  return addDays(x, -x.getDay());
}
function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function weekendBgClass(d) {
  return isWeekend(d) ? "bg-muted/5" : "";
}
function fmtTime(d) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatClock(d, { withSeconds = false } = {}) {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
  });
}
function fmtTimeInput(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// Converte um objeto Time (do TimeField) de volta pro formato "HH:mm" que o
// resto do componente usa (startT/endT, save(), etc).
function timeValueToInput(t) {
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}
function fmtDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// Soma `minutesToAdd` a um horário "HH:mm" e devolve o novo horário mais
// quantos dias ele "estourou" (dayOffset), para o caso de um procedimento longo
// terminar depois da meia-noite.
function addMinutesToTimeString(timeStr, minutesToAdd) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutesToAdd;
  const DAY = 24 * 60;
  const dayOffset = Math.floor(total / DAY);
  const normalized = ((total % DAY) + DAY) % DAY;
  const eh = Math.floor(normalized / 60);
  const em = normalized % 60;
  return {
    time: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
    dayOffset,
  };
}
// Soma `days` a uma string de data "YYYY-MM-DD".
function addDaysToDateString(dateStr, days) {
  if (!days) return dateStr;
  const [y, m, d] = dateStr.split("-").map(Number);
  return fmtDateInput(new Date(y, (m ?? 1) - 1, (d ?? 1) + days));
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAYS_PT_SHORT = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];

function snapToSlot(minutesOfDay) {
  return Math.max(0, Math.min(24 * 60, Math.round(minutesOfDay / SLOT_MIN) * SLOT_MIN));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ------------------------------ persistence ---------------------------- */
// Converte um agendamento vindo da API (GET/POST/PUT /appointments) para o
// formato interno usado pelo calendário (Date objects, clientId/clientName).
function mapAppointmentFromApi(a) {
  return {
    id: a.id,
    title: a.title,
    start: new Date(a.date),
    end: new Date(a.endDate),
    color: a.color || "blue",
    status: a.status,
    notes: a.notes ?? "",
    serviceId: a.serviceId ?? a.service?.id ?? null,
    clientId: a.customerId ?? a.customer?.id ?? null,
    clientName: a.customer?.name,
    clientPhone: a.customer?.phone,
    // reservado pra quando o cadastro de cliente tiver foto - por ora fica
    // undefined e o Avatar cai no fallback de iniciais
    clientPhoto: a.customer?.photo ?? a.customer?.avatar ?? null,
    professionalId: a.professionalId ?? a.professional?.id ?? null,
    professionalName: a.professional?.name,
  };
}
// Converte o formato interno para o payload esperado por
// POST /appointments e PUT /appointments/:id.
function toAppointmentPayload(a) {
  return {
    title: a.title,
    date: a.start.toISOString(),
    endDate: a.end.toISOString(),
    color: a.color,
    notes: a.notes ?? "",
    serviceId: a.serviceId || null,
    customerId: a.clientId || null,
    professionalId: a.professionalId || null,
  };
}

function MovePreview({ move, appointment }) {
  const { start, end } = getSnappedMove(move, appointment);
  const minutes = start.getHours()*60 + start.getMinutes();
  const top = (minutes / SLOT_MIN) * SLOT_PX;
  const height =
   ((end-start)/60000 / SLOT_MIN) * SLOT_PX;

  const c = colorMap[appointment.color] ?? colorMap.blue;

  return (
    <div className={`absolute inset-x-1 rounded-md border-2 pointer-events-none ${c.border}`}
      style={{
        top,
        height,
        backgroundColor: "transparent",
      }}
    />
  );
}

function getSnappedMove(move, appointment) {
  const dayDelta = move.currentDayIndex - move.originalDayIndex;

  const rawStart = addMinutes(
    addDays(move.originalStart, dayDelta),
    move.deltaMin
  );

  const snapped = snapToSlot(
    rawStart.getHours() * 60 + rawStart.getMinutes()
  );

  const start = addMinutes(startOfDay(rawStart), snapped);

  return {
    start,
    end: new Date(start.getTime() + (appointment.end - appointment.start))
  };
}

function getFreeMove(move, appointment) {
  const dayDelta = move.currentDayIndex - move.originalDayIndex;

  const start = addMinutes(
    addDays(move.originalStart, dayDelta),
    move.deltaMin
  );

  return {
    start,
    end: new Date(
      start.getTime() +
      (appointment.end.getTime() - appointment.start.getTime())
    ),
  };
}

/* ------------------------------ Component ----------------------------- */

export default function Agenda() {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => startOfDay(now));
  const [view, setView] = useState("week");
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [dragEnabled, setDragEnabled] = useState(false);

  // Sincroniza com a preferência salva assim que o usuário logado carrega
  useEffect(() => {
    if (typeof user?.settings?.dragAppointments === "boolean") {
      setDragEnabled(user.settings.dragAppointments);
    }
  }, [user]);

  // Carrega agendamentos, clientes e procedimentos do banco ao montar.
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setLoadError(null);
      try {
        const { appointments: appts, clients: customersList, services: servicesList } =
          await fetchSchedulingData();
        if (cancelled) return;

        // Blindagem: se a API devolveu algo que não é array (ex: um objeto
        // de erro que passou despercebido, token expirado, etc), avisa com
        // uma mensagem clara em vez de quebrar com ".map is not a function".
        if (!Array.isArray(appts) || !Array.isArray(customersList) || !Array.isArray(servicesList)) {
          console.error("Resposta inesperada da API:", { appts, customersList, servicesList });
          throw new Error(
            "A API não devolveu os dados esperados. Confira se o login ainda é válido (token pode ter expirado) e se o servidor está rodando a versão mais recente."
          );
        }

        setAppointments(appts.map(mapAppointmentFromApi));
        setClients(customersList);
        setServices(servicesList);
      } catch (err) {
        console.error("Falha ao carregar dados da agenda:", err);
        if (!cancelled) setLoadError(err.message || "Falha ao carregar a agenda.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const headerTitle = useMemo(() => {
    if (view === "day") {
      return `${cursor.getDate()} de ${MONTHS_PT[cursor.getMonth()]} de ${cursor.getFullYear()}`;
    }
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      if (s.getMonth() === e.getMonth()) {
        return `${MONTHS_PT[s.getMonth()]} ${s.getFullYear()}`;
      }
      return `${MONTHS_PT[s.getMonth()]} – ${MONTHS_PT[e.getMonth()]} ${e.getFullYear()}`;
    }
    return `${MONTHS_PT[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }, [cursor, view]);

  const navigate = (dir) => {
    if (dir === 0) {
      setCursor(startOfDay(new Date()));
      return;
    }
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else {
      setCursor((c) => {
        const x = new Date(c);
        x.setMonth(x.getMonth() + dir);
        return startOfDay(x);
      });
    }
  };

  const onCreate = async (a) => {
    try {
      const created = await createAppointment(toAppointmentPayload(a));
      const mapped = mapAppointmentFromApi(created);
      setAppointments((list) => [...list, mapped]);
      return mapped;
    } catch (err) {
      console.error("Falha ao criar agendamento:", err);
      alert(err.message || "Falha ao criar agendamento.");
      return null;
    }
  };

  const onUpdate = async (a) => {
    // atualização otimista: aplica na tela antes da resposta do servidor
    const previous = appointments;
    setAppointments((list) => list.map((x) => (x.id === a.id ? a : x)));
    try {
      const updated = await updateAppointment(a.id, toAppointmentPayload(a));
      setAppointments((list) => list.map((x) => (x.id === a.id ? mapAppointmentFromApi(updated) : x)));
    } catch (err) {
      console.error("Falha ao atualizar agendamento:", err);
      setAppointments(previous); // desfaz a mudança otimista
      alert(err.message || "Falha ao atualizar agendamento.");
    }
  };

  const onDelete = async (id) => {
    const previous = appointments;
    setAppointments((list) => list.filter((x) => x.id !== id));
    try {
      await deleteAppointment(id);
    } catch (err) {
      console.error("Falha ao cancelar agendamento:", err);
      setAppointments(previous);
      alert(err.message || "Falha ao cancelar agendamento.");
    }
  };

  const onStatusChange = async (id, status) => {
    const previous = appointments;
    setAppointments((list) => list.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      const updated = await updateAppointmentStatus(id, status);
      setAppointments((list) => list.map((x) => (x.id === id ? mapAppointmentFromApi(updated) : x)));
    } catch (err) {
      console.error("Falha ao atualizar status:", err);
      setAppointments(previous);
      alert(err.message || "Falha ao atualizar o status do agendamento.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border bg-overlay text-foreground"> {/* div tamanho agenda */}
      <Header
        title={headerTitle}
        view={view}
        onViewChange={setView}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onToday={() => navigate(0)}
      />

      {loadError && (
        <div className="px-4 py-2 text-sm font-medium text-red-600 bg-red-500/10 border-b border-red-500/20">
          {loadError}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted font-semibold">
            Carregando...
          </div>
        ) : view === "month" ? (
          <MonthView
            cursor={cursor}
            appointments={appointments}
            onSelectDay={(d) => {
              setCursor(d);
              setView("day");
            }}
            onEditAppointment={(a) => setEditing(a)}
          />
        ) : (
          <TimeGrid
            className="flex-1 h-screen"
            cursor={cursor}
            view={view}
            appointments={appointments}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onEdit={(a) => setEditing(a)}
            onStatusChange={onStatusChange}
            dragEnabled={dragEnabled}
          />
        )}
      </div>

      {editing && (
        <EditModal
          appointment={editing}
          clients={clients}
          services={services}
          onClose={() => setEditing(null)}
          onSave={(a) => {
            onUpdate(a);
            setEditing(null);
          }}
          onDelete={(id) => {
            onDelete(id);
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <CreateModal
          defaultDate={cursor}
          clients={clients}
          services={services}
          onClose={() => setCreating(false)}
          onSave={(a) => {
            onCreate(a);
            setCreating(false);
          }}
        />
      )}
      <Tooltip delay={10}>
        <Button
          isIconOnly
          size="lg"
          variant="primary"
          className="fixed bottom-10 right-10 h-15 w-15 rounded-full"
          onPress={() => setCreating(true)}
          aria-label="New event"
        >
          <Plus className="size-10" />
        </Button>
        <Tooltip.Content showArrow placement="bottom">
          <Tooltip.Arrow />
            <p className="font-semibold">Novo Evento</p>
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}

/* ------------------------------- DayView ------------------------------ */
export function DayView({
  date = new Date(),
  appointments,
  onCreate,
  onUpdate,
  onDelete,
  onEdit = () => {},
  onStatusChange,
}) {
  const isControlled = appointments !== undefined;
  const [localAppts, setLocalAppts] = useState([]);

  // Modo standalone (sem receber `appointments` por prop): busca da API.
  useEffect(() => {
    if (isControlled) return;
    let cancelled = false;
    fetchAppointments()
      .then((data) => {
        if (!cancelled) setLocalAppts(data.map(mapAppointmentFromApi));
      })
      .catch((err) => console.error("Falha ao carregar agendamentos:", err));
    return () => {
      cancelled = true;
    };
  }, [isControlled]);

  const localCreate = async (a) => {
    try {
      const created = await createAppointment(toAppointmentPayload(a));
      const mapped = mapAppointmentFromApi(created);
      setLocalAppts((list) => [...list, mapped]);
      return mapped;
    } catch (err) {
      console.error("Falha ao criar agendamento:", err);
      return null;
    }
  };
  const localUpdate = async (a) => {
    setLocalAppts((list) => list.map((x) => (x.id === a.id ? a : x)));
    try {
      const updated = await updateAppointment(a.id, toAppointmentPayload(a));
      setLocalAppts((list) => list.map((x) => (x.id === a.id ? mapAppointmentFromApi(updated) : x)));
    } catch (err) {
      console.error("Falha ao atualizar agendamento:", err);
    }
  };
  const localDelete = async (id) => {
    setLocalAppts((list) => list.filter((x) => x.id !== id));
    try {
      await deleteAppointment(id);
    } catch (err) {
      console.error("Falha ao cancelar agendamento:", err);
    }
  };
  const localStatusChange = async (id, status) => {
    setLocalAppts((list) => list.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      const updated = await updateAppointmentStatus(id, status);
      setLocalAppts((list) => list.map((x) => (x.id === id ? mapAppointmentFromApi(updated) : x)));
    } catch (err) {
      console.error("Falha ao atualizar status:", err);
    }
  };

  const list = isControlled ? appointments : localAppts;

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-border">
      <TimeGrid
        cursor={startOfDay(date)}
        view="day"
        appointments={list}
        onCreate={onCreate ?? localCreate}
        onUpdate={onUpdate ?? localUpdate}
        onDelete={onDelete ?? localDelete}
        onEdit={onEdit}
        onStatusChange={onStatusChange ?? localStatusChange}
      />
    </div>
  );
}

// Hook reutilizável para ler os agendamentos direto do banco fora do
// componente de Agenda — usado por widgets como o card "Sessão atual" da Home.
export function useAppointments() {
  const [appointments, setAppointments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchAppointments()
        .then((data) => {
          if (!cancelled) setAppointments(data.map(mapAppointmentFromApi));
        })
        .catch((err) => console.error("Falha ao carregar agendamentos:", err));
    };

    load();
    // sem websocket disponível ainda: reconsulta periodicamente pra
    // refletir agendamentos criados/editados em outra aba/tela
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return appointments;
}

export { isWeekend, weekendBgClass, formatClock, colorMap };

/* ------------------------------- Header ------------------------------ */

function Header({ title, view, onViewChange, onPrev, onNext, onToday }) {
  
  return (
    <header className="flex items-center justify-between gap-4 border-danger bg-overlay rounded-t-3xl px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Tabs
          className="w-60 max-w-md"
          selectedKey={view}
          onSelectionChange={(key) => onViewChange(key)}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="View options">
              <Tabs.Tab id="day">
                Dia
                <Tabs.Indicator />
              </Tabs.Tab>

              <Tabs.Tab id="week">
                Semana
                <Tabs.Indicator />
              </Tabs.Tab>

              <Tabs.Tab id="month">
                Mês
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <Separator className="mx-1 h-6 w-px bg-border mt-2" orientation="vertical" />

        <Tooltip delay={0}>
          <Button isIconOnly size="sm" variant="ghost" onPress={onPrev} aria-label="Prev">
            <ChevronLeft className="size-4" />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <p className="font-semibold">Anterior</p>
          </Tooltip.Content>
        </Tooltip>

        <Button size="sm" variant="outline" className="bg-overlay" onPress={onToday}>
          Hoje
        </Button>

        <Tooltip delay={0}>
          <Button isIconOnly size="sm" variant="ghost" onPress={onNext} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <p className="font-semibold">Próximo</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  );
}

/* ------------------------------ TimeGrid ----------------------------- */
function TimeGrid({ cursor, view, appointments, onCreate, onUpdate, onDelete, onEdit, onStatusChange, dragEnabled = true }) {
  const days = useMemo(() => {
    if (view === "day") return [startOfDay(cursor)];
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor, view]);

  const scrollRef = useRef(null);
  const columnsRef = useRef(null);
  const [select, setSelect] = useState(null);
  const [move, setMove] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowPx = (nowMinutes / SLOT_MIN) * SLOT_PX;
    el.scrollTop = Math.max(0, nowPx - el.clientHeight / 2);
  }, []);

  const getColumnRect = (idx) => {
    const grid = columnsRef.current;
    if (!grid) return null;
    const col = grid.children.item(idx);
    return col ? col.getBoundingClientRect() : null;
  };
  const yToSlot = (y, rectTop) => {
    const rel = y - rectTop;
    return Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(rel / SLOT_PX)));
  };
  const xToDayIndex = (x) => {
    const grid = columnsRef.current;
    if (!grid) return 0;
    for (let i = 0; i < days.length; i++) {
      const r = grid.children.item(i).getBoundingClientRect();
      if (x >= r.left && x <= r.right) return i;
    }
    const first = grid.children.item(0).getBoundingClientRect();
    if (x < first.left) return 0;
    return days.length - 1;
  };

  const onColumnPointerDown = (e, dayIndex) => {
    if (!dragEnabled) return;
    if (menuOpen) return;
    if (e.button !== 0) return;
    if (e.target.closest("[data-appt]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = yToSlot(e.clientY, rect.top);
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelect({ dayIndex, startSlot: slot, endSlot: slot });
  };
  const onColumnPointerMove = (e) => {
    if (!select) return;
    const rect = getColumnRect(select.dayIndex);
    if (!rect) return;
    const slot = yToSlot(e.clientY, rect.top);
    setSelect((s) => (s ? { ...s, endSlot: slot } : s));
  };
  const onColumnPointerUp = async (e) => {
    if (!select) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    const start = Math.min(select.startSlot, select.endSlot);

    const isClick = select.startSlot === select.endSlot;

    const oneHourSlots = 60 / SLOT_MIN;

    const end = isClick
      ? start + oneHourSlots
      : Math.max(select.startSlot, select.endSlot) + 1;
    const day = days[select.dayIndex];
    const a = {
      id: uid(),
      title: "Novo evento",
      start: addMinutes(day, start * SLOT_MIN),
      end: addMinutes(day, end * SLOT_MIN),
      color: "blue",
    };
    setSelect(null);
    // espera o registro ser criado no banco antes de abrir a edição, pra
    // termos o id real (o id temporário do uid() não existe na API)
    const created = await onCreate(a);
    if (created) onEdit(created);
  };

  useEffect(() => {
    if (!move) return;
    const onMove = (ev) => {
      const dayIdx = xToDayIndex(ev.clientX);
      const deltaX = ev.clientX - move.pointerStartX;
      const deltaY = ev.clientY - move.pointerStartY;
      const deltaMin = (deltaY / SLOT_PX) * SLOT_MIN;
      setMove((m) => (m ? {
        ...m,
        pointerX: ev.clientX,
        pointerY: ev.clientY,
        deltaX,
        deltaMin,
        currentDayIndex: dayIdx,
      } : m));
    };
    const onUp = () => {
      setMove((m) => {
        if (!m) return null;
        const appt = appointments.find((a) => a.id === m.id);
        if (appt) {
          const dur = appt.end.getTime() - appt.start.getTime();
          const dayDelta = m.currentDayIndex - m.originalDayIndex;
          const newStart = addMinutes(addDays(m.originalStart, dayDelta), m.deltaMin);
          const snappedMin = snapToSlot(newStart.getHours() * 60 + newStart.getMinutes());
          const dayBase = startOfDay(newStart);
          const finalStart = addMinutes(dayBase, snappedMin);
          const finalEnd = new Date(finalStart.getTime() + dur);
          onUpdate({ ...appt, start: finalStart, end: finalEnd });
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [move?.id, appointments]);

  const startMove = (e, appt) => {
    if (!dragEnabled) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const dayIndex = days.findIndex((d) => sameDay(d, startOfDay(appt.start)));
    if (dayIndex < 0) return;
    setMove({
      id: appt.id,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      deltaX: 0,
      originalStart: new Date(appt.start),
      originalDayIndex: dayIndex,
      currentDayIndex: dayIndex,
      deltaMin: 0,
    });
  };

  const todayIdx = days.findIndex((d) => sameDay(d, new Date()));

  return (
    <>
      <DragOverlay
        move={move}
        appointment={ appointments.find(a => a.id === move?.id) }
      />
      <div ref={scrollRef} className="h-full overflow-y-auto hide-scrollbar">
        <div
          className="sticky top-0 z-99 grid border-b border-border bg-overlay"
          style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div />
            {days.map((d) => {
              const isToday = sameDay(d, new Date());

              return (
                <div
                  key={d.toISOString()}
                  className="flex items-center justify-center font-semibold text-muted mb-2 mt-2"
                >
                  <span
                    className={`text-sm ${
                      isToday
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {DAYS_PT_SHORT[d.getDay()]}
                  </span>

                  <div
                    className={`
                      flex size-6 items-center justify-center ml-2
                      rounded-full text-xs font-medium transition-colors text-muted
                      ${
                        isToday
                          ? "bg-red-500 text-white"
                          : "text-foreground"
                      }
                    `}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
        </div>

        <div
          className="relative grid"
          style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="border-r border-border font-semibold">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative text-right text-[11px] text-muted-foreground" style={{ height: HOUR_PX }}>
                <span className="absolute -top-3 right-2">{h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</span>
              </div>
            ))}
          </div>

          <div
            ref={columnsRef}
            className="relative col-span-full col-start-2 grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day, dayIdx) => {
              const dayStart = startOfDay(day);
              const dayEnd = addDays(dayStart, 1);
              const dayAppts = appointments.filter((a) => a.start < dayEnd && a.end > dayStart);
              const weekendClass = weekendBgClass(day);
              return (
                <div
                  key={dayIdx}
                  className={"relative border-l border-border " + (dayIdx === todayIdx ? "" : weekendClass)}
                  style={{ height: TOTAL_SLOTS * SLOT_PX }}
                  onPointerDown={(e) => onColumnPointerDown(e, dayIdx)}
                  onPointerMove={onColumnPointerMove}
                  onPointerUp={onColumnPointerUp}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className="pointer-events-none bg-border absolute inset-x-0 border-t border-border/60"
                      style={{ top: h * HOUR_PX }}
                    />
                  ))}
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={`h${h}`}
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-border/20" /* marcação meia hora */
                      style={{ top: h * HOUR_PX + HOUR_PX / 2 }}
                    />
                  ))}

                  {select && select.dayIndex === dayIdx && (
                    <DragSelectPreview
                      startSlot={Math.min(select.startSlot, select.endSlot)}
                      endSlot={Math.max(select.startSlot, select.endSlot) + 1}
                      day={day}
                    />
                  )}

                  {move &&
                    move.currentDayIndex === dayIdx &&
                    (() => {
                      const appt = appointments.find(a => a.id === move.id);
                      if (!appt) return null;

                      return (
                        <MovePreview move={move} appointment={appt} />
                      );
                    })()
                  }  

                  {dayAppts.map((a) => {
                    const isMoving = move?.id === a.id;
                    let displayStart = a.start;
                    let displayEnd = a.end;
                    if (isMoving && move) {

                      if (move.currentDayIndex !== move.originalDayIndex) {
                        return null;
                      }

                      const snappedMove = getSnappedMove(move, a);

                      displayStart = snappedMove.start;
                      displayEnd   = snappedMove.end;
                    }

                    const clippedStart = displayStart < dayStart ? dayStart : displayStart;
                    const clippedEnd = displayEnd > dayEnd ? dayEnd : displayEnd;
                    const continuesBefore = clippedStart.getTime() !== displayStart.getTime();
                    const continuesAfter = clippedEnd.getTime() !== displayEnd.getTime();
                    
                    return (
                      <AppointmentCard
                        key={a.id}
                        appointment={a}
                        displayStart={clippedStart}
                        displayEnd={clippedEnd}
                        continuesBefore={continuesBefore}
                        continuesAfter={continuesAfter}
                        isMoving={isMoving}
                        isGhost={move?.id === a.id}
                        onPointerDown={(e) => startMove(e, a)}
                        dragEnabled={dragEnabled}
                        onEdit={() => onEdit(a)}
                        onDelete={() => onDelete(a.id)}
                        onChangeColor={(c) => onUpdate({ ...a, color: c })}
                        onStatusChange={onStatusChange}
                        onSaveNotes={(id, notes) => onUpdate({ ...a, notes })}
                        onDuplicate={() => {
                          const dur = a.end.getTime() - a.start.getTime();
                          onCreate({
                            ...a,
                            id: uid(),
                            start: new Date(a.end),
                            end: new Date(a.end.getTime() + dur),
                          });
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          {todayIdx >= 0 && <NowLine days={days} todayIdx={todayIdx} now={now} />}
        </div>
      </div>
    </>
  );
}

function NowLine({ days = [], todayIdx = -1, now = new Date() }) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / SLOT_MIN) * SLOT_PX;
  const colWidthPct = days.length > 0 ? 100 / days.length : 100;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 grid"
      style={{ top, gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
    >

      <div className="relative">
        <div className="absolute -top-2.5 right-0 z-10 flex h-4.5 items-center rounded-full bg-red-500 py-2.5 px-2 leading-none">
          <span className="whitespace-nowrap text-[12px] font-semibold text-white">
            {formatClock(now)}
          </span>
        </div>
      </div>

      <div className="relative" style={{ gridColumn: `2 / -1` }}>
        <div className="border-t-2 border-red-600/20" />
        {todayIdx >= 0 && (
          <div
            className="absolute top-0 border-t-2 border-red-600"
            style={{ left: `${todayIdx * colWidthPct}%`, width: `${colWidthPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function DragOverlay({ move, appointment }) {
    if (!move || !appointment) return null;

    const { start, end } = getFreeMove(move, appointment);

    const duration =
        (end - start) / 60000;

    return (
        <div
            className="fixed z-[99999] pointer-events-none"
            style={{
                left: move.pointerX,
                top: move.pointerY,
                width: 220,
                transform: "translate(-20px,-10px)",
            }}
        >
            <AppointmentCard
              appointment={appointment}
              displayStart={start}
              displayEnd={end}
              overlay
            />
        </div>
    );
}

function DragSelectPreview({ startSlot, endSlot, day }) {
  const top = startSlot * SLOT_PX;
  const height = Math.max(SLOT_PX, (endSlot - startSlot) * SLOT_PX);
  const s = addMinutes(day, startSlot * SLOT_MIN);
  const e = addMinutes(day, endSlot * SLOT_MIN);
  return (
    <div
      className="pointer-events-none absolute inset-x-1 z-10 rounded-md
      border border-dashed border-focus/70 bg-focus/15 px-2 py-1 text-[11px] font-medium"
      style={{ top, height }}
    >
      {fmtTime(s)} – {fmtTime(e)}
    </div>
  );
}

/* --------------------------- Appointment ----------------------------- */

// Iniciais do cliente pro fallback do Avatar quando não há foto
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Opções do dropdown de status - rótulos batem com o StatusMap usado no
// histórico do cliente (SessionHistory.jsx), só que aqui como lista pro Select
const STATUS_OPTIONS = [
  { id: "Scheduled", label: "Aguardando confirmação" },
  { id: "Confirmed", label: "Confirmado" },
  { id: "Completed", label: "Finalizado" },
  { id: "Cancelled", label: "Cancelado" },
  { id: "NoShow", label: "Não compareceu" },
];

// Monta o link de WhatsApp pro NÚMERO DO CLIENTE que agendou (não é o
// WHATSAPP_NUMBER da clínica usado em outras telas - aqui é a equipe
// confirmando a sessão diretamente com quem agendou).
function buildClientWhatsAppUrl(appointment) {
  if (!appointment.clientPhone) return null;

  const digits = appointment.clientPhone.replace(/\D/g, "");
  if (!digits) return null;
  // assume DDI 55 quando o telefone salvo só tem DDD + número
  const withCountryCode = digits.length <= 11 ? `55${digits}` : digits;

  const firstName = appointment.clientName?.trim().split(/\s+/)[0] ?? "";
  const dateLabel = appointment.start.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const message =
    `Olá${firstName ? ` ${firstName}` : ""}, tudo bem? Passando para confirmar sua sessão` +
    `${appointment.title ? ` de ${appointment.title}` : ""} no dia ${dateLabel} às ${fmtTime(appointment.start)}.`;

  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

/**
 * Popover com os detalhes do cliente/profissional e ações rápidas
 * (confirmar por WhatsApp, mudar status, anotar algo) pra cada agendamento
 * da agenda do funcionário.
 */
function AppointmentPopover({ appointment, color, onStatusChange, onSaveNotes }) {
  const [notes, setNotes] = useState(appointment.notes ?? "");

  // se o popover for reaberto num agendamento diferente (ou as anotações
  // mudarem por fora), sincroniza o rascunho local
  useEffect(() => {
    setNotes(appointment.notes ?? "");
  }, [appointment.id, appointment.notes]);

  const whatsAppUrl = buildClientWhatsAppUrl(appointment);

  const commitNotes = () => {
    if (notes !== (appointment.notes ?? "")) onSaveNotes(notes);
  };

  return (
    <Popover>
      <Button
        size="sm"
        variant="primary"
        aria-label="Scheduling details"
        className="absolute top-1 right-1 h-7 w-7 size-6 min-w-0 p-0"
        style={{ backgroundColor: color.color }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <UserRound className="size-6" />
      </Button>

      <Popover.Content className="max-w-100">
        <Popover.Dialog>
          <Popover.Heading className="flex items-center gap-3">
            <Avatar size="lg">
              {appointment.clientPhoto && (
                <Avatar.Image alt={appointment.clientName} src={appointment.clientPhoto} />
              )}
              <Avatar.Fallback>{getInitials(appointment.clientName)}</Avatar.Fallback>
            </Avatar>

            <div className="min-w-0">
              <h3 className="truncate font-semibold">
                {appointment.clientName || "Sem cliente vinculado"}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {appointment.clientPhone && (
                  <span className="text-xs text-muted">{appointment.clientPhone}</span>
                )}
                {whatsAppUrl && (
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center rounded-lg bg-success/10 hover:bg-success-soft text-xs font-semibold text-success  gap-1.5 px-2.5 py-1"
                  >
                    <MessageCircle size={14} />
                    Confirmar sessão
                  </a>
                )}
              </div>
            </div>
          </Popover.Heading>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-muted font-semibold">
              <IdCardLanyard size={16} className="outline-2 outline-surface-secondary bg-surface-secondary rounded-full" />
              {appointment.professionalName || "Sem profissional definido"}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2 text-foreground-muted">
                <CalendarIcon size={16} className="outline-2 outline-surface-secondary bg-surface-secondary rounded-full" />
                {appointment.start.toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="flex items-center gap-2 text-foreground">
                <Clock size={16} className="outline-2 outline-surface-secondary bg-surface-secondary rounded-full" />
                {fmtTime(appointment.start)} – {fmtTime(appointment.end)}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <Label className="mb-1 block text-muted">Status</Label>
            <Select
              aria-label="Status do agendamento"
              className="w-full"
              selectedKey={appointment.status}
              onSelectionChange={onStatusChange}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {STATUS_OPTIONS.map((opt) => (
                    <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                      {opt.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <div className="mt-4">
            <Label htmlFor={`ap-notes-${appointment.id}`} className="mb-1 block text-muted">
              Anotações
            </Label>
            <textarea
              id={`ap-notes-${appointment.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              rows={3}
              placeholder="Observações sobre esse agendamento..."
              className="w-full resize-none rounded-lg border border-border bg-transparent p-2 text-sm outline-none focus:border-focus"
            />
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function AppointmentCard({
  appointment,
  displayStart,
  displayEnd,
  isGhost,
  continuesBefore = false,
  continuesAfter = false,
  onPointerDown,
  onEdit,
  onDelete,
  onChangeColor,
  onDuplicate,
  onStatusChange,
  onSaveNotes,
  overlay = false,
  dragEnabled = true,
  transform,
}) {
  const [menuPos, setMenuPos] = useState(null);

  const minutesFromStart = displayStart.getHours() * 60 + displayStart.getMinutes();
  const durMin = Math.max(SLOT_MIN, (displayEnd.getTime() - displayStart.getTime()) / 60_000);
  const top = (minutesFromStart / SLOT_MIN) * SLOT_PX;
  const height = (durMin / SLOT_MIN) * SLOT_PX;
  const c = colorMap[appointment.color] ?? colorMap.blue;

  const style = overlay
    ? {
        height,
        width: "170px",
    }
    : {
        top,
        height,
    };

  const onContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        data-appt
        onPointerDown={onPointerDown}
        onContextMenu={onContext}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
        className={
          "absolute inset-x-1 z-[5] select-none overflow-hidden border-l-4 px-2 py-1 text-default-foreground shadow-sm transition-shadow " +
          (dragEnabled ? "cursor-grab active:cursor-grabbing " : "cursor-default ") +
          c.bg + " " + c.border +
          (continuesBefore ? " rounded-t-none" : " rounded-t-md") +
          (continuesAfter ? " rounded-b-none" : " rounded-b-md") +
          (isGhost ? " opacity-20" : "")
        }
        style={style}
      >
        <div className="pr-8">
          <div className="truncate text-[12px] font-semibold leading-tight">
            {continuesBefore ? "▸ " : ""}{appointment.title}
          </div>
          {appointment.clientName && (
            <div className="truncate text-[10px] opacity-90 font-medium">
              {appointment.clientName}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-90 font-semibold">
            <Clock className="size-3" />
            {fmtTime(displayStart)} – {fmtTime(displayEnd)}{continuesAfter ? " ▸" : ""}
          </div>
        </div>

        {!overlay && (
          <AppointmentPopover
            appointment={appointment}
            color={c}
            onStatusChange={(status) => onStatusChange?.(appointment.id, status)}
            onSaveNotes={(notes) => onSaveNotes?.(appointment.id, notes)}
          />
        )}
      </div>

      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onChangeColor={onChangeColor}
          currentColor={appointment.color}
        />
      )}
    </>
  );
}

/* --------------------------- Context Menu ---------------------------- */

function ContextMenu({ x, y, onClose, onEdit, onDelete, onDuplicate, onChangeColor, currentColor }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 280);
  const handleEdit = () => {
    setTimeout(() => {
      onEdit?.();
      onClose();
    }, 0);
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="fixed z-9999 w-58 overflow-hidden rounded-2xl border bg-overlay shadow-xl p-2"
      style={{ left, top }}
    >
      <div className="grid grid-row-2 items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
        <Label className="flex items-center"><Palette className="size-5 mr-1"/>Color</Label>
        
          <ColorSwatchPicker
            aria-label="Select color"
            className="gap-0 justify-center"
            value={parseColor(hexById[currentColor] ?? COLORS[0].color)}
            onChange={(color) => {
              const hex = color.toString("hex").toLowerCase();
              const id = idByHex[hex] ?? currentColor;
              setTimeout(() => {
                onChangeColor?.(id);
                onClose?.();
              }, 0);
            }}
          >
            {COLORS.map((c) => (
              <ColorSwatchPicker.Item key={c.id} color={c.color} textValue={c.label}>
                <ColorSwatchPicker.Swatch />
                <ColorSwatchPicker.Indicator />
              </ColorSwatchPicker.Item>
            ))}
          </ColorSwatchPicker>
      </div>

      <Dropdown.Menu aria-label="Menu">
        
        <Dropdown.Item
          variant="ghost"
          className="flex w-full gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold mt-2"
          onClick={handleEdit}
        >
          <Pencil className="size-4" /> Editar
        </Dropdown.Item>

        <Dropdown.Item
          variant="ghost"
          className="flex w-full gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold mt-1"
          onClick={() => setTimeout(() => { onDuplicate?.(); onClose(); }, 0)}
        >
          <Copy className="size-4" /> Duplicar
        </Dropdown.Item>

        <Separator className="mt-2" />

        <Dropdown.Item
          variant="ghost"
          className="flex w-full items-center gap-2 rounded-xl text-danger font-semibold text-sm px-2 py-1.5 mt-3"
          onClick={() => setTimeout(() => { onDelete?.(); onClose(); }, 0)}
        >
          <Trash2 className="size-4" /> Delete
        </Dropdown.Item>
      </Dropdown.Menu>
    </div>
  );
}

/* ----------------------------- Edit Modal ----------------------------- */

function EditModal({ appointment, clients = [], services = [], onClose, onSave, onDelete }) {
  const availableServices = useMemo(() => services.filter((s) => s.available), [services]);
  const servicesById = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);
  const clientsById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const [title, setTitle] = useState(appointment.title);
  const [date, setDate] = useState(fmtDateInput(appointment.start));
  const [endDate, setEndDate] = useState(fmtDateInput(appointment.end));
  const [startT, setStartT] = useState(fmtTimeInput(appointment.start));
  const [endT, setEndT] = useState(fmtTimeInput(appointment.end));
  const [color, setColor] = useState(appointment.color);
  const [serviceId, setServiceId] = useState(appointment.serviceId ?? null);
  const [clientId, setClientId] = useState(appointment.clientId ?? null);

  // Ao selecionar um procedimento: preenche o título com o nome do procedimento e
  // pré-seleciona o horário de término somando a duração do procedimento ao
  // horário de início atual (o usuário ainda pode ajustar manualmente
  // depois).
  const handleServiceSelect = (key) => {
    setServiceId(key);
    const svc = key ? servicesById[key] : null;
    if (!svc) return;
    setTitle(svc.title);
    const { time, dayOffset } = addMinutesToTimeString(startT, svc.duration);
    setEndT(time);
    setEndDate(addDaysToDateString(date, dayOffset));
  };

  const save = () => {
    const [y, m, d] = date.split("-").map(Number);
    const [ey, em2, ed] = (endDate || date).split("-").map(Number);
    const [sh, sm] = startT.split(":").map(Number);
    const [eh, em] = endT.split(":").map(Number);
    const start = new Date(y, (m ?? 1) - 1, d ?? 1, sh ?? 0, sm ?? 0);
    let end = new Date(ey ?? y, (em2 ?? m ?? 1) - 1, ed ?? d ?? 1, eh ?? 0, em ?? 0);
    if (end <= start) end = addMinutes(start, 30);
    onSave({
      ...appointment,
      title: title.trim() || "Sem título",
      start,
      end,
      color,
      serviceId: serviceId || null,
      clientId: clientId || null,
      clientName: clientId ? clientsById[clientId]?.name : undefined,
    });
  };

  return (
    <AlertDialog.Backdrop isOpen onOpenChange={(o) => !o && onClose()}>
      <AlertDialog.Container className="sm:max-w-lg">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading className="flex items-center text-xl gap-2 mb-4">
              <Pencil className="size-5" /> Editar agendamento
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="space-y-6">
              <div className="grid grid-rows space-y-1.5 space-x-2">
                <Label htmlFor="ap-title" className="text-muted">Sessão / Título</Label>
                <ComboBox
                  aria-label="title"
                  allowsCustomValue
                  inputValue={title}
                  onInputChange={setTitle}
                  selectedKey={serviceId}
                  onSelectionChange={handleServiceSelect}
                  className="w-full"
                >
                  <ComboBox.InputGroup>
                    <Input
                      id="ap-title"
                      placeholder="Selecione um procedimento ou digite um título"
                      autoFocus
                      className="border border-border font-semibold"
                    />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox className="font-semibold">
                      {availableServices.map((svc) => (
                        <ListBox.Item key={svc.id} id={svc.id} textValue={svc.title}>
                          {svc.title}
                          <ListBox.ItemIndicator className="text-focus" />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </div>

              <div className="grid grid-rows space-y-1.5 space-x-2">
                <Label htmlFor="ap-client" className="text-muted">Cliente</Label>
                <ComboBox
                  aria-label="Users"
                  selectedKey={clientId}
                  onSelectionChange={setClientId}
                  allowsEmptyCollection
                  className="w-full"
                >
                  <ComboBox.InputGroup>
                    <Input
                      id="ap-client"
                      placeholder="Buscar cliente..."
                      className="border border-border font-semibold"
                    />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox className="font-semibold">
                      {clients.map((c) => (
                        <ListBox.Item key={c.id} id={c.id} textValue={c.name}>
                          {c.name}
                          <ListBox.ItemIndicator className="text-focus" />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="grid grid-rows space-y-1.5 space-x-2 items-center">
                  <Label className="text-muted">Data inicial</Label>
                  <DatePicker
                    aria-label="Date"
                    name="date"
                    value={date ? parseDate(date) : null}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      const next = newValue.toString();
                      setDate(next);
                      if (endDate && next > endDate) setEndDate(next);
                    }}
                    className="mb-0 font-semibold"
                  >
                    <DateField.Group fullWidth className="border border-border">
                      <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                      <DateField.Suffix>
                        <DatePicker.Trigger>
                          <DatePicker.TriggerIndicator />
                        </DatePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DatePicker.Popover>
                      <Calendar aria-label="Event date">
                        <Calendar.Header>
                          <Calendar.YearPickerTrigger>
                            <Calendar.YearPickerTriggerHeading />
                            <Calendar.YearPickerTriggerIndicator />
                          </Calendar.YearPickerTrigger>
                          <Calendar.NavButton slot="previous" />
                          <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid>
                          <Calendar.GridHeader>
                            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                          </Calendar.GridHeader>
                          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                        </Calendar.Grid>
                        <Calendar.YearPickerGrid>
                          <Calendar.YearPickerGridBody>
                            {({year}) => <Calendar.YearPickerCell year={year} />}
                          </Calendar.YearPickerGridBody>
                        </Calendar.YearPickerGrid>
                      </Calendar>
                      <Button
                        className="mt-2"
                        variant="tertiary"
                        size="sm"
                        onPress={() => setDate(today(getLocalTimeZone()).toString())}
                      >
                        Definir para hoje
                      </Button>
                    </DatePicker.Popover>
                  </DatePicker>
                </div>
                
                <div className="grid grid-rows space-y-1.5">
                  <Label htmlFor="ap-start" className="text-muted">Hora inicial</Label>
                  <TimeField
                    id="ap-start"
                    aria-label="Start-time"
                    className="w-full font-semibold"
                    value={parseTime(startT)}
                    onChange={(newValue) => {
                      if (newValue) setStartT(timeValueToInput(newValue));
                    }}
                  >
                    <TimeField.Group fullWidth className="border border-border">
                      <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                      <TimeField.Suffix>
                        <Clock className="size-4 text-muted" />
                      </TimeField.Suffix>
                    </TimeField.Group>
                  </TimeField>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="grid grid-rows space-y-1.5 space-x-2 items-center">
                  <Label className="text-muted">Data final</Label>
                  <DatePicker
                    aria-label="End date"
                    name="endDate"
                    value={endDate ? parseDate(endDate) : null}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      const next = newValue.toString();
                      setEndDate(next < date ? date : next);
                    }}
                    className="mb-0 font-semibold"
                  >
                    <DateField.Group fullWidth className="border border-border">
                      <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                      <DateField.Suffix>
                        <DatePicker.Trigger>
                          <DatePicker.TriggerIndicator />
                        </DatePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DatePicker.Popover>
                      <Calendar aria-label="Event end date">
                        <Calendar.Header>
                          <Calendar.YearPickerTrigger>
                            <Calendar.YearPickerTriggerHeading />
                            <Calendar.YearPickerTriggerIndicator />
                          </Calendar.YearPickerTrigger>
                          <Calendar.NavButton slot="previous" />
                          <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid>
                          <Calendar.GridHeader>
                            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                          </Calendar.GridHeader>
                          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                        </Calendar.Grid>
                        <Calendar.YearPickerGrid>
                          <Calendar.YearPickerGridBody>
                            {({year}) => <Calendar.YearPickerCell year={year} />}
                          </Calendar.YearPickerGridBody>
                        </Calendar.YearPickerGrid>
                      </Calendar>
                      <Button
                        className="mt-2"
                        variant="tertiary"
                        size="sm"
                        onPress={() => setEndDate(date)}
                      >
                        Mesma data inicial
                      </Button>
                    </DatePicker.Popover>
                  </DatePicker>
                </div>

                
                <div className="grid grid-rows space-y-1.5">
                  <Label htmlFor="ap-end" className="text-muted">Hora final</Label>
                  <TimeField
                    id="ap-end"
                    aria-label="End time"
                    className="w-full font-semibold"
                    value={parseTime(endT)}
                    onChange={(newValue) => {
                      if (newValue) setEndT(timeValueToInput(newValue));
                    }}
                  >
                    <TimeField.Group fullWidth className="border border-border">
                      <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                      <TimeField.Suffix>
                        <Clock className="size-4 text-muted" />
                      </TimeField.Suffix>
                    </TimeField.Group>
                  </TimeField>
                </div>
              </div>

              <div>
                <Label aria-label="Select color" className="mb-2 flex items-center text-muted gap-1">
                  <Palette size={15} /> Cor
                </Label>
                <ColorSwatchPicker
                  aria-label="Select color"
                  className="gap-2 justify-start"
                  value={parseColor(hexById[color] ?? COLORS[0].color)}
                  onChange={(c) => {
                    const hex = c.toString("hex").toLowerCase();
                    const id = idByHex[hex] ?? color;
                    setColor(id);
                  }}
                >
                  {COLORS.map((c) => (
                    <ColorSwatchPicker.Item key={c.id} color={c.color} textValue={c.label}>
                      <ColorSwatchPicker.Swatch />
                      <ColorSwatchPicker.Indicator />
                    </ColorSwatchPicker.Item>
                  ))}
                </ColorSwatchPicker>
              </div>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex !justify-between sm:!justify-between">
            <Button variant="danger-soft" onPress={() => onDelete(appointment.id)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onPress={onClose}>Cancelar</Button>
              <Button variant="primary" onPress={save}>Salvar</Button>
            </div>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

/* ------------------------------ CreateModal ---------------------------- */

function CreateModal({ defaultDate, clients = [], services = [], onClose, onSave }) {
  const availableServices = useMemo(() => services.filter((s) => s.available), [services]);
  const servicesById = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);
  const clientsById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const now = new Date();
  const initialStart = new Date(defaultDate);
  initialStart.setHours(now.getHours(), 0, 0, 0);
  const initialEnd = addMinutes(initialStart, 60);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(fmtDateInput(initialStart));
  const [endDate, setEndDate] = useState(fmtDateInput(initialEnd));
  const [startT, setStartT] = useState(fmtTimeInput(initialStart));
  const [endT, setEndT] = useState(fmtTimeInput(initialEnd));
  const [color, setColor] = useState(COLORS[0].id);
  const [serviceId, setServiceId] = useState(null);
  const [clientId, setClientId] = useState(null);

  // Ao selecionar um procedimento: preenche o título com o nome do procedimento e
  // pré-seleciona o horário de término somando a duração do procedimento ao
  // horário de início atual (o usuário ainda pode ajustar manualmente
  // depois).
  const handleServiceSelect = (key) => {
    setServiceId(key);
    const svc = key ? servicesById[key] : null;
    if (!svc) return;
    setTitle(svc.title);
    const { time, dayOffset } = addMinutesToTimeString(startT, svc.duration);
    setEndT(time);
    setEndDate(addDaysToDateString(date, dayOffset));
  };

  const save = () => {
    const [y, m, d] = date.split("-").map(Number);
    const [ey, em2, ed] = (endDate || date).split("-").map(Number);
    const [sh, sm] = startT.split(":").map(Number);
    const [eh, em] = endT.split(":").map(Number);
    const start = new Date(y, (m ?? 1) - 1, d ?? 1, sh ?? 0, sm ?? 0);
    let end = new Date(ey ?? y, (em2 ?? m ?? 1) - 1, ed ?? d ?? 1, eh ?? 0, em ?? 0);
    if (end <= start) end = addMinutes(start, 30);
    onSave({
      id: uid(),
      title: title.trim() || "Sem título",
      start,
      end,
      color,
      serviceId: serviceId || null,
      clientId: clientId || null,
      clientName: clientId ? clientsById[clientId]?.name : undefined,
    });
  };

  return (
    <AlertDialog.Backdrop isOpen onOpenChange={(o) => !o && onClose()}>
      <AlertDialog.Container className="sm:max-w-lg">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading className="flex items-center text-xl gap-2 mb-4">
              Novo evento
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="space-y-6">
              <div className="grid grid-rows space-y-1.5 space-x-2">
                <Label htmlFor="new-ap-title" className="text-muted">Título do evento</Label>
                <ComboBox
                  aria-label="Procedimento"
                  allowsCustomValue
                  inputValue={title}
                  onInputChange={setTitle}
                  selectedKey={serviceId}
                  onSelectionChange={handleServiceSelect}
                  className="w-full"
                >
                  <ComboBox.InputGroup>
                    <Input
                      id="new-ap-title"
                      placeholder="Selecione um procedimento ou digite um título"
                      autoFocus
                      className="border-2 border-border font-semibold"
                    />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {availableServices.map((svc) => (
                        <ListBox.Item key={svc.id} id={svc.id} textValue={svc.title}>
                          {svc.title}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </div>

              <div className="grid grid-rows space-y-1.5 space-x-2">
                <Label htmlFor="new-ap-client" className="text-muted">Cliente</Label>
                <ComboBox
                  aria-label="user"
                  selectedKey={clientId}
                  onSelectionChange={setClientId}
                  allowsEmptyCollection
                  className="w-full"
                >
                  <ComboBox.InputGroup>
                    <Input
                      id="new-ap-client"
                      placeholder="Buscar cliente..."
                      className="border-2 border-border font-semibold"
                    />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {clients.map((c) => (
                        <ListBox.Item key={c.id} id={c.id} textValue={c.name}>
                          {c.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="grid grid-rows space-y-1.5 space-x-2 items-center">
                  <Label className="text-muted">Data inicial</Label>
                  <DatePicker
                    aria-label="Date"
                    name="date"
                    value={date ? parseDate(date) : null}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      const next = newValue.toString();
                      setDate(next);
                      if (endDate && next > endDate) setEndDate(next);
                    }}
                    className="mb-0 font-semibold"
                  >
                    <DateField.Group fullWidth className="border-2 border-border">
                      <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                      <DateField.Suffix>
                        <DatePicker.Trigger>
                          <DatePicker.TriggerIndicator />
                        </DatePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DatePicker.Popover>
                      <Calendar aria-label="Event date">
                        <Calendar.Header>
                          <Calendar.YearPickerTrigger>
                            <Calendar.YearPickerTriggerHeading />
                            <Calendar.YearPickerTriggerIndicator />
                          </Calendar.YearPickerTrigger>
                          <Calendar.NavButton slot="previous" />
                          <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid>
                          <Calendar.GridHeader>
                            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                          </Calendar.GridHeader>
                          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                        </Calendar.Grid>
                        <Calendar.YearPickerGrid>
                          <Calendar.YearPickerGridBody>
                            {({year}) => <Calendar.YearPickerCell year={year} />}
                          </Calendar.YearPickerGridBody>
                        </Calendar.YearPickerGrid>
                      </Calendar>
                      <Button
                        className="mt-2"
                        variant="tertiary"
                        size="sm"
                        onPress={() => setDate(today(getLocalTimeZone()).toString())}
                      >
                        Definir para hoje
                      </Button>
                    </DatePicker.Popover>
                  </DatePicker>
                </div>
                
                <div className="grid grid-rows space-y-1.5">
                  <Label htmlFor="new-ap-start" className="text-muted">Hora inicial</Label>
                  <TimeField
                    aria-label="start-time"
                    id="new-ap-start"
                    className="w-full font-semibold"
                    value={parseTime(startT)}
                    onChange={(newValue) => {
                      if (newValue) setStartT(timeValueToInput(newValue));
                    }}
                  >
                    <TimeField.Group fullWidth className="border-2 border-border">
                      <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                      <TimeField.Suffix>
                        <Clock className="size-4 text-muted" />
                      </TimeField.Suffix>
                    </TimeField.Group>
                  </TimeField>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="grid grid-rows space-y-1.5 space-x-2 items-center">
                  <Label className="text-muted">Data final</Label>
                  <DatePicker
                    aria-label="End date"
                    name="endDate"
                    value={endDate ? parseDate(endDate) : null}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      const next = newValue.toString();
                      setEndDate(next < date ? date : next);
                    }}
                    className="mb-0 font-semibold"
                  >
                    <DateField.Group fullWidth className="border-2 border-border">
                      <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                      <DateField.Suffix>
                        <DatePicker.Trigger>
                          <DatePicker.TriggerIndicator />
                        </DatePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DatePicker.Popover>
                      <Calendar aria-label="Event end date">
                        <Calendar.Header>
                          <Calendar.YearPickerTrigger>
                            <Calendar.YearPickerTriggerHeading />
                            <Calendar.YearPickerTriggerIndicator />
                          </Calendar.YearPickerTrigger>
                          <Calendar.NavButton slot="previous" />
                          <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid>
                          <Calendar.GridHeader>
                            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                          </Calendar.GridHeader>
                          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                        </Calendar.Grid>
                        <Calendar.YearPickerGrid>
                          <Calendar.YearPickerGridBody>
                            {({year}) => <Calendar.YearPickerCell year={year} />}
                          </Calendar.YearPickerGridBody>
                        </Calendar.YearPickerGrid>
                      </Calendar>
                      <Button
                        className="mt-2"
                        variant="tertiary"
                        size="sm"
                        onPress={() => setEndDate(date)}
                      >
                        Mesma data inicial
                      </Button>
                    </DatePicker.Popover>
                  </DatePicker>
                </div>

                
                <div className="grid grid-rows space-y-1.5">
                  <Label htmlFor="new-ap-end" className="text-muted">Hora final</Label>
                  <TimeField
                    aria-label="end-time"
                    id="new-ap-end"
                    className="w-full font-semibold"
                    value={parseTime(endT)}
                    onChange={(newValue) => {
                      if (newValue) setEndT(timeValueToInput(newValue));
                    }}
                  >
                    <TimeField.Group fullWidth className="border-2 border-border">
                      <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                      <TimeField.Suffix>
                        <Clock className="size-4 text-muted" />
                      </TimeField.Suffix>
                    </TimeField.Group>
                  </TimeField>
                </div>
              </div>

              <div>
                <Label aria-label="Select color" className="mb-2 flex items-center text-muted">
                  <Palette className="size-5 mr-1" /> Cor
                </Label>
                <ColorSwatchPicker
                  aria-label="Select color"
                  className="gap-2 justify-start"
                  value={parseColor(hexById[color] ?? COLORS[0].color)}
                  onChange={(c) => {
                    const hex = c.toString("hex").toLowerCase();
                    const id = idByHex[hex] ?? color;
                    setColor(id);
                  }}
                >
                  {COLORS.map((c) => (
                    <ColorSwatchPicker.Item key={c.id} color={c.color} textValue={c.label}>
                      <ColorSwatchPicker.Swatch />
                      <ColorSwatchPicker.Indicator />
                    </ColorSwatchPicker.Item>
                  ))}
                </ColorSwatchPicker>
              </div>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="outline" onPress={onClose}>Cancelar</Button>
            <Button variant="primary" onPress={save}>Criar</Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

/* ------------------------------ MonthView ---------------------------- */

function MonthView({ cursor, appointments, onSelectDay, onEditAppointment }) {
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-border bg-overlay">
        {DAYS_PT_SHORT.map((d) => (
          <div key={d} className="px-2 py-2 text-center font-semibold text-sm tracking-wide text-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, new Date());
          const weekendClass = inMonth ? weekendBgClass(d) : "";
          const dStart = startOfDay(d);
          const dEnd = addDays(dStart, 1);
          const dayAppts = appointments
            .filter((a) => a.start < dEnd && a.end > dStart)
            .sort((a, b) => a.start.getTime() - b.start.getTime());
          // Reserva uma linha para o "+X more" quando não cabem todas as
          // sessões: mostra 2 + rótulo em vez de 3 + rótulo, senão o
          // rótulo "vaza" para fora do quadrado do dia.
          const MAX_VISIBLE = 3;
          const visibleCount = dayAppts.length > MAX_VISIBLE ? MAX_VISIBLE - 1 : MAX_VISIBLE;
          return (
            <div
              key={i}
              className={
                "flex flex-col gap-1 overflow-hidden border-b border-r border-border p-1.5 text-left transition hover:bg-focus/20 " +
                (inMonth ? `bg-background ${weekendClass}` : "bg-muted/30 text-muted-foreground")
              }
              onClick={() => onSelectDay(d)}
            >
              <div className="flex shrink-0 justify-end">
                <span
                  className={
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium " +
                    (isToday ? "bg-red-500 text-white" : "")
                  }
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayAppts.slice(0, visibleCount).map((a) => {
                  const c = colorMap[a.color] ?? colorMap.blue;
                  const isContinuation = !sameDay(a.start, d);
                  return (
                    <button
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditAppointment(a);
                      }}
                      className={"shrink-0 truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium " + c.soft}
                    >
                      {isContinuation ? "▸ " : `${fmtTime(a.start)} `}{a.title}
                    </button>
                  );
                })}
                {dayAppts.length > visibleCount && (
                  <span className="shrink-0 px-1 text-[10px] font-semibold text-muted">+ {dayAppts.length - visibleCount} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
