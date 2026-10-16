import { useEffect, useMemo, useState } from "react";
import { CalendarDateTime, getLocalTimeZone, today } from "@internationalized/date";
import api from "../api/api";
import { fetchBusyWindows, createAppointment } from "../api/appointments";
import { ageFromBirthdate, minAgeBlockMessage } from "../utils/age";

// ---- Config do horário de funcionamento (ajuste conforme o negócio) ----
const BUSINESS_START_MINUTES = 8 * 60; // 08:00
const BUSINESS_END_MINUTES = 19 * 60; // 19:00
const SLOT_STEP_MINUTES = 30;

function minutesToLabel(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export const TOTAL_STEPS = 4; // procedimento > data e horário > pagamento > confirmação

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
  const [paymentMethod, setPaymentMethod] = useState(null); // "Pix" | "CreditCard" | "DebitCard" | "Cash"

  // Cupom: primeiro é validado (/coupons/validate, não consome nada) contra o
  // serviço escolhido; só é de fato consumido (/coupons/apply) quando o
  // agendamento é confirmado. O cupom precisa ter sido resgatado antes na
  // aba Cupons - aqui só reaproveitamos o resgate que já está na carteira.
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { redemptionId, coupon, discountAmount }
  const [couponError, setCouponError] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const minDate = today(getLocalTimeZone());

  // idade do cliente logado, para avisar cedo sobre procedimentos com idade mínima
  // (a API também recusa com 403 - isto só evita o cliente descobrir no final)
  const [customerBirthdate, setCustomerBirthdate] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/users/me")
      .then((me) => {
        if (!cancelled) setCustomerBirthdate(me?.birthdate ?? null);
      })
      .catch(() => {
        /* sem idade conhecida: não bloqueia aqui, a API valida na confirmação */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const customerAge = useMemo(() => ageFromBirthdate(customerBirthdate), [customerBirthdate]);

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

  // idade mínima do procedimento escolhido (null = liberado)
  const selectedServiceBlockedMessage = minAgeBlockMessage(selectedService, customerAge);
  const isServiceAllowed = (service) => !minAgeBlockMessage(service, customerAge);

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
    setCouponCode("");
    setAppliedCoupon(null);
    setCouponError("");
  }

  /** Valida (sem consumir) o cupom digitado contra o serviço escolhido. */
  async function applyCoupon() {
    if (!couponCode.trim() || !selectedService) return;

    setIsApplyingCoupon(true);
    setCouponError("");
    try {
      const result = await api.post("/coupons/validate", {
        code: couponCode.trim().toUpperCase(),
        serviceId: selectedService.id,
        purchaseAmount: selectedService.price,
      });
      setAppliedCoupon(result);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.message || "Não foi possível aplicar esse cupom.");
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  }

  /** Passo 1 -> 2. Retorna { ok: false, message } se faltar o procedimento. */
  function goToDateTime() {
    if (!selectedService) {
      return { ok: false, message: "Selecione o procedimento." };
    }
    if (selectedServiceBlockedMessage) {
      return { ok: false, message: selectedServiceBlockedMessage };
    }
    setStep(2);
    return { ok: true };
  }

  /** Passo 2 -> 3 (pagamento). Retorna { ok: false, message } se faltar a data ou o horário. */
  function goToPayment() {
    if (!selectedService || !selectedDate || !selectedSlot) {
      return { ok: false, message: "Selecione a data e o horário." };
    }
    setStep(3);
    return { ok: true };
  }

  /** Passo 3 -> 4 (confirmação). Retorna { ok: false, message } se faltar a forma de pagamento. */
  function goToConfirmation() {
    if (!selectedService || !selectedDate || !selectedSlot) {
      return { ok: false, message: "Selecione a data e o horário." };
    }
    if (!paymentMethod) {
      return { ok: false, message: "Escolha a forma de pagamento." };
    }
    // gera o código só na primeira vez que chega na confirmação - se o
    // cliente voltar e avançar de novo, mantém o mesmo código
    setBookingCode((current) => current ?? generateBookingCode());
    setStep(4);
    return { ok: true };
  }

  /**
   * O que falta preencher pra poder abrir uma etapa (null = pode abrir).
   * Voltar é sempre permitido; avançar exige as etapas anteriores prontas.
   */
  function getStepBlocker(target) {
    if (confirmedAppointment) return "O agendamento já foi confirmado.";
    if (target >= 2 && !selectedService) return "Selecione o procedimento.";
    if (target >= 2 && selectedServiceBlockedMessage) return selectedServiceBlockedMessage;
    if (target >= 3 && (!selectedDate || !selectedSlot)) return "Selecione a data e o horário.";
    if (target >= 4 && !paymentMethod) return "Escolha a forma de pagamento.";
    return null;
  }

  /** Usado pelo Stepper pra desabilitar etapas ainda inacessíveis. */
  function canGoToStep(target) {
    return target >= 1 && target <= TOTAL_STEPS && getStepBlocker(target) === null;
  }

  /** Navega direto pra uma etapa (clique na numeração). Retorna { ok } ou { ok: false, message }. */
  function goToStep(target) {
    if (target === step) return { ok: true };
    if (target < 1 || target > TOTAL_STEPS) return { ok: false, message: "Etapa inválida." };
    const message = getStepBlocker(target);
    if (message) return { ok: false, message };
    if (target === 4) return goToConfirmation();
    setStep(target);
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
    if (!paymentMethod) {
      throw new Error("Escolha a forma de pagamento.");
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
        setStep(2); // horário foi tomado: volta pra escolher outro
        return { ok: false, conflict: true };
      }

      const appointment = await createAppointment({
        serviceId: selectedService.id,
        title: selectedService.title,
        date: selectedSlot.start,
        endDate: selectedSlot.end,
        code: bookingCode,
        paymentMethod,
      });

      // o back-end tenta usar o `code` enviado; se por acaso já estiver em
      // uso (colisão rara), ele mesmo sorteia outro e devolve o valor final
      setConfirmedAppointment(appointment);

      // o agendamento já está garantido nesse ponto; se o cupom falhar por
      // qualquer motivo (expirou/limite bateu entre a validação e agora), a
      // gente não desfaz o agendamento - só avisa que o cupom não entrou
      let discountAmount = null;
      let couponFailed = false;
      if (appliedCoupon) {
        try {
          const applied = await api.post("/coupons/apply", {
            redemptionId: appliedCoupon.redemptionId,
            serviceId: selectedService.id,
            purchaseAmount: selectedService.price,
            appointmentId: appointment.id,
          });
          discountAmount = applied.discountAmount;
        } catch (err) {
          couponFailed = true;
          setCouponError(err.message || "O agendamento foi confirmado, mas o cupom não pôde ser aplicado.");
        }
      }

      return { ok: true, appointment, discountAmount, couponFailed };
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
    selectedServiceBlockedMessage,
    isServiceAllowed,
    customerAge,
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
    paymentMethod,
    setPaymentMethod,
    couponCode,
    setCouponCode,
    appliedCoupon,
    couponError,
    isApplyingCoupon,
    applyCoupon,
    removeCoupon,
    goToDateTime,
    goToPayment,
    goToConfirmation,
    goToStep,
    canGoToStep,
    isConfirmed: Boolean(confirmedAppointment),
    goBack,
    confirmBooking,
  };
}
