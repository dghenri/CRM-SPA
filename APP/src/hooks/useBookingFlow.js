import { useEffect, useMemo, useState } from "react";
import { CalendarDateTime, getLocalTimeZone, today } from "@internationalized/date";
import api from "../api/api";
import { fetchBusyWindows, createAppointment } from "../api/appointments";

// ---- Config do horário de funcionamento (ajuste conforme o negócio) ----
const BUSINESS_START_MINUTES = 8 * 60; // 08:00
const BUSINESS_END_MINUTES = 19 * 60; // 19:00
const SLOT_STEP_MINUTES = 30;

function minutesToLabel(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Gera um código de 6 letras maiúsculas (ex: "QQJZTF") pra exibir na tela de confirmação. */
function generateBookingCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  }
  return code;
}

/** Converte um CalendarDate + minutos-desde-meia-noite num Date real, no fuso local. */
function dateAtMinutes(calendarDate, minutesFromMidnight) {
  const dt = new CalendarDateTime(
    calendarDate.year,
    calendarDate.month,
    calendarDate.day,
    Math.floor(minutesFromMidnight / 60),
    minutesFromMidnight % 60
  );
  return dt.toDate(getLocalTimeZone());
}

function buildTimeSlots({ calendarDate, duration, busyWindows, now }) {
  const slots = [];

  for (
    let startMinutes = BUSINESS_START_MINUTES;
    startMinutes + duration <= BUSINESS_END_MINUTES;
    startMinutes += SLOT_STEP_MINUTES
  ) {
    const start = dateAtMinutes(calendarDate, startMinutes);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const isPast = start <= now;

    const hasConflict = busyWindows.some((busy) => {
      const busyStart = new Date(busy.date);
      const busyEnd = new Date(busy.endDate);
      return start < busyEnd && end > busyStart;
    });

    slots.push({
      start,
      end,
      label: minutesToLabel(startMinutes),
      isAvailable: !isPast && !hasConflict,
    });
  }

  return slots;
}

/**
 * Toda a lógica do fluxo de agendamento, sem nenhuma UI.
 * Usado tanto pela página (SchedulingNew, com serviço pré-selecionado via
 * :id na rota) quanto pelo modal aberto a partir da tela de Agendamentos
 * (sem serviço pré-selecionado).
 */
export function useBookingFlow({ initialServiceId = null } = {}) {
  const [services, setServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState("");

  const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId);
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(null); // CalendarDate
  const [selectedSlot, setSelectedSlot] = useState(null); // { start, end, label }

  const [busyWindows, setBusyWindows] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState(null); // guarda o agendamento criado (com o código confirmado pelo back-end)
  const [bookingCode, setBookingCode] = useState(null); // código de 6 letras já mostrado no resumo, antes de confirmar

  const minDate = today(getLocalTimeZone());

  // carrega os procedimentos disponíveis pro dropdown
  useEffect(() => {
    let cancelled = false;

    api
      .get("/services")
      .then((data) => {
        if (cancelled) return;
        const available = data.filter((s) => s.available !== false);
        setServices(available);

        // se veio um id pré-selecionado (via :id na rota) mas ele não existe
        // ou não está disponível, não trava a tela - só some da seleção
        if (initialServiceId && !available.some((s) => String(s.id) === String(initialServiceId))) {
          setSelectedServiceId(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setServicesError(err.message || "Erro ao carregar procedimentos.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingServices(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === String(selectedServiceId)) ?? null,
    [services, selectedServiceId]
  );

  // recarrega os horários ocupados sempre que o serviço ou a data mudam
  useEffect(() => {
    if (!selectedDate || !selectedService) return;

    let cancelled = false;
    setIsLoadingSlots(true);
    setSlotsError("");
    setSelectedSlot(null);

    const dayStart = dateAtMinutes(selectedDate, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    fetchBusyWindows(selectedService.id, dayStart, dayEnd)
      .then((data) => {
        if (!cancelled) setBusyWindows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlotsError(err.message || "Erro ao verificar horários disponíveis.");
          setBusyWindows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedService]);

  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedService) return [];
    return buildTimeSlots({
      calendarDate: selectedDate,
      duration: selectedService.duration,
      busyWindows,
      now: new Date(),
    });
  }, [selectedDate, selectedService, busyWindows]);

  const formattedDate = selectedDate
    ? new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(selectedDate.toDate(getLocalTimeZone()))
    : "";

  function handleSelectService(id) {
    setSelectedServiceId(id);
    setSelectedDate(null);
    setSelectedSlot(null);
    setBusyWindows([]);
    setBookingCode(null);
    setConfirmedAppointment(null);
  }

  /** Passo 1 -> 2. Retorna { ok: false, message } se faltar o procedimento. */
  function goToDateTime() {
    if (!selectedService) {
      return { ok: false, message: "Selecione o procedimento." };
    }
    setStep(2);
    return { ok: true };
  }

  /** Passo 2 -> 3. Retorna { ok: false, message } se faltar algo, ou avança pra confirmação. */
  function goToConfirmation() {
    if (!selectedService || !selectedDate || !selectedSlot) {
      return { ok: false, message: "Selecione a data e o horário." };
    }
    // gera o código só na primeira vez que chega na confirmação - se o
    // cliente voltar e avançar de novo, mantém o mesmo código
    setBookingCode((current) => current ?? generateBookingCode());
    setStep(3);
    return { ok: true };
  }

  /** Volta uma etapa (3 -> 2 -> 1). */
  function goBack() {
    setStep((current) => Math.max(1, current - 1));
  }

  /**
   * Revalida contra o backend e cria o agendamento.
   * Retorna { ok: true, appointment } | { ok: false, conflict: true } e
   * já reseta o horário selecionado se um conflito for encontrado na hora H.
   */
  async function confirmBooking() {
    if (!selectedService || !selectedDate || !selectedSlot) {
      throw new Error("Selecione o procedimento, a data e o horário.");
    }

    setIsSubmitting(true);
    try {
      const dayStart = dateAtMinutes(selectedDate, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const freshBusy = await fetchBusyWindows(selectedService.id, dayStart, dayEnd);

      const hasConflict = freshBusy.some((busy) => {
        const busyStart = new Date(busy.date);
        const busyEnd = new Date(busy.endDate);
        return selectedSlot.start < busyEnd && selectedSlot.end > busyStart;
      });

      if (hasConflict) {
        setBusyWindows(freshBusy);
        setSelectedSlot(null);
        setStep(2);
        return { ok: false, conflict: true };
      }

      const appointment = await createAppointment({
        serviceId: selectedService.id,
        title: selectedService.title,
        date: selectedSlot.start,
        endDate: selectedSlot.end,
        code: bookingCode,
      });

      // o back-end tenta usar o `code` enviado; se por acaso já estiver em
      // uso (colisão rara), ele mesmo sorteia outro e devolve o valor final
      setConfirmedAppointment(appointment);

      return { ok: true, appointment };
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    services,
    isLoadingServices,
    servicesError,
    selectedServiceId,
    selectedService,
    handleSelectService,
    step,
    selectedDate,
    setSelectedDate,
    selectedSlot,
    setSelectedSlot,
    timeSlots,
    isLoadingSlots,
    slotsError,
    minDate,
    formattedDate,
    isSubmitting,
    confirmedAppointment,
    bookingCode,
    goToDateTime,
    goToConfirmation,
    goBack,
    confirmBooking,
  };
}
