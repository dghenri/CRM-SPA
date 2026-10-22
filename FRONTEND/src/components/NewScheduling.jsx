import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Spinner, toast } from "@heroui/react";
import { ChevronLeft, ArrowRight, Check, MessageCircle } from "lucide-react";
import api from "../api/api";
import { useBookingFlow } from "../hooks/useBookingFlow";
import { BookingStepOne, BookingStepTwo, BookingStepPayment, BookingStepConfirmation } from "./BookingFlowFields";
import Steps from "./Steps";
import MobileNav from "./MobileNav";
import SlideCommit from "./SlideButton";

const STEP_LABELS = ["Procedimento", "Data e horário", "Pagamento", "Confirmação"];

// Número do WhatsApp do studio (só dígitos, com DDI+DDD). Defina VITE_WHATSAPP_NUMBER no .env do front;
// enquanto isso, este é um número de exemplo que você corrige.
const STUDIO_WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || "5571999999999";
const SUCCESS_GREEN = "#22c55e"; // mesmo verde do botão deslizante, para a transição ser contínua

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Tela cheia pós-agendamento: um círculo verde cresce a partir do botão deslizante até cobrir a tela
 * e pergunta se o cliente quer confirmar agora pelo WhatsApp ou deixar para depois.
 */
function BookingDoneOverlay({ origin, expanded, summary, onWhatsApp, onLater }) {
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => e.key === "Escape" && onLater();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onLater]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-done-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-6 py-10 text-white transition-[clip-path] duration-600 ease-out"
      style={{
        background: SUCCESS_GREEN,
        clipPath: expanded
          ? `circle(150% at ${origin.x}% ${origin.y}%)`
          : `circle(0% at ${origin.x}% ${origin.y}%)`,
      }}
    >
      <div
        className={`flex w-full max-w-sm flex-col items-center gap-6 text-center transition-all duration-500 ease-out ${
          expanded ? "translate-y-0 opacity-100 delay-400" : "translate-y-4 opacity-0"
        }`}
      >
        <div className="flex size-24 items-center justify-center rounded-full bg-white/20">
          <Check className="size-14" strokeWidth={3} />
        </div>

        <div className="flex flex-col gap-2">
          <h2 id="booking-done-title" className="text-2xl font-bold">
            Agendamento realizado!
          </h2>
          {summary && <p className="text-sm font-semibold text-white/85">{summary}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold">Quer confirmar agora pelo WhatsApp?</p>
          <p className="text-sm font-medium text-white/80">
            É rapidinho: abrimos uma mensagem pronta para a nossa equipe. Se preferir, você confirma depois.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button
            size="lg"
            className="h-14 w-full justify-center rounded-full bg-white text-base font-bold text-[#15803d]"
            onPress={onWhatsApp}
          >
            <MessageCircle size={20} />
            Confirmar pelo WhatsApp
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-12 w-full justify-center rounded-full text-base font-semibold text-white hover:bg-white/15"
            onPress={onLater}
          >
            Deixar para depois
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Botão "deslize para agendar": ocupa a largura disponível (o componente pede largura em px). */
function ConfirmSlider({ boxRef, onConfirm, onDone, onError }) {
  const [width, setWidth] = useState(300);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.min(Math.round(el.clientWidth), 440)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [boxRef]);

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      <SlideCommit
        label="Deslize para agendar"
        doneLabel="Agendado!"
        errorLabel="Não foi possível agendar"
        onConfirm={onConfirm}
        onDone={onDone}
        onError={onError}
        trackColor="#262626"
        handleColor="#ffffff"
        successColor="#22c55e"
        dangerColor="#e5484d"
        width={width}
        height={60}
        radius={30}
        holdMs={1500}
      />
    </div>
  );
}

export default function SchedulingNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: idFromRoute } = useParams();

  // O procedimento pode chegar de duas formas: pelo :id da rota (link antigo,
  // ex. compartilhado/favoritado) ou pelo state da navegação, vindo do botão
  // "Iniciar agendamento" da tela de detalhes (ServiceDetail).
  const initialServiceId = idFromRoute ?? location.state?.serviceId ?? null;

  const flow = useBookingFlow({ initialServiceId });

  // Só agenda quem tem o perfil completo (telefone e data de nascimento).
  // Confere ao entrar e leva direto para a seção que falta; o back-end também
  // recusa (403) se alguém tentar burlar essa tela.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/users/me")
      .then((me) => {
        if (cancelled) return;
        const missingPhone = !String(me?.phone ?? "").trim();
        const missingBirthdate = !me?.birthdate;
        if (!missingPhone && !missingBirthdate) return;

        toast("Complete seu perfil para agendar", {
          description: "Precisamos do seu telefone e da data de nascimento.",
          variant: "danger",
        });
        navigate(`/user/account?editar=${missingPhone ? "telefone" : "nascimento"}`, { replace: true });
      })
      .catch(() => {
        /* sem rede: segue, o back-end valida na confirmação */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    const result =
      flow.step === 1
        ? flow.goToDateTime()
        : flow.step === 2
        ? flow.goToPayment()
        : flow.goToConfirmation();
    if (!result.ok) {
      toast(result.message, { variant: "danger" });
    }
  };

  // clique na numeração do Steps: voltar sempre pode; avançar só com as etapas anteriores prontas
  const handleStepClick = (stepNumber) => {
    const result = flow.goToStep(stepNumber);
    if (!result.ok) {
      toast(result.message, { variant: "danger" });
    }
  };

  // Chamado pelo botão deslizante: ele mostra o carregando enquanto a Promise não resolve,
  // "Agendado!" se resolver e o erro se rejeitar (por isso lançamos nos casos de falha).
  const confirmResult = useRef(null);
  const handleSlideConfirm = async () => {
    const result = await flow.confirmBooking();

    if (!result.ok && result.conflict) {
      toast("Esse horário acabou de ser reservado", {
        description: "Escolha outro horário para continuar.",
        variant: "danger",
      });
      const error = new Error("conflict");
      error.handled = true; // já avisamos acima
      throw error;
    }

    confirmResult.current = result;
    return result;
  };

  // tela de sucesso (círculo verde que cresce a partir do botão deslizante)
  const sliderBoxRef = useRef(null);
  const [doneOverlay, setDoneOverlay] = useState(null); // { origin, expanded, appointment, summary }
  const overlayTimer = useRef(0);
  useEffect(() => () => clearTimeout(overlayTimer.current), []);

  const handleSlideDone = () => {
    const result = confirmResult.current;
    if (!result) return;

    if (result.couponFailed) {
      toast("O cupom não pôde ser aplicado", {
        description: "Seu agendamento foi confirmado normalmente.",
        variant: "danger",
      });
    }

    const summary = [
      `${flow.selectedService.title} · ${flow.formattedDate} às ${flow.selectedSlot.label}`,
      result.discountAmount ? `cupom aplicado (-${brl(result.discountAmount)})` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    // deixa o "Agendado!" verde aparecer um instante; aí o círculo cresce a partir do botão
    overlayTimer.current = setTimeout(() => {
      const rect = sliderBoxRef.current?.getBoundingClientRect();
      const origin = rect
        ? {
            x: ((rect.left + rect.width / 2) / window.innerWidth) * 100,
            y: ((rect.top + rect.height / 2) / window.innerHeight) * 100,
          }
        : { x: 50, y: 90 };
      setDoneOverlay({ origin, expanded: false, appointment: result.appointment, summary });
      // dois frames: um para pintar em 0% e outro para animar até o tamanho final
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setDoneOverlay((o) => (o ? { ...o, expanded: true } : o)))
      );
    }, 600);
  };

  const goToAppointments = () => navigate("/user/scheduling", { replace: true });

  const confirmOnWhatsApp = () => {
    const a = doneOverlay?.appointment;
    const message =
      `Olá! Acabei de agendar ${flow.selectedService.title} para ${flow.formattedDate} às ${flow.selectedSlot.label}` +
      `${a?.code ? ` (código #${a.code})` : ""}. Gostaria de confirmar meu agendamento.`;
    window.open(`https://wa.me/${STUDIO_WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    goToAppointments();
  };

  const handleSlideError = (err) => {
    if (err?.handled) return;
    toast("Não foi possível confirmar", {
      description: err?.message || "Tente novamente em instantes.",
      variant: "danger",
    });
  };

  const handleBack = () => {
    if (flow.step > 1) {
      flow.goBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <MobileNav onBack={handleBack} title="Agendamento" />

      <main className="flex-1 overflow-y-auto pt-20 pb-50">
        <Steps
          steps={STEP_LABELS}
          currentStep={flow.step}
          canGoToStep={flow.canGoToStep}
          onStepClick={handleStepClick}
        />

        <div className="px-5">
          {flow.isLoadingServices ? (
            <div className="flex items-center justify-center gap-2 py-16">
              <Spinner color="current" />
              <p className="text-sm font-semibold text-muted">Carregando procedimentos</p>
            </div>
          ) : flow.step === 1 ? (
            <BookingStepOne flow={flow} />
          ) : flow.step === 2 ? (
            <BookingStepTwo flow={flow} />
          ) : flow.step === 3 ? (
            <BookingStepPayment flow={flow} />
          ) : (
            <>
              <BookingStepConfirmation flow={flow} />
              <button
                type="button"
                onClick={flow.goBack}
                className="mt-4 flex items-center gap-1 text-sm font-semibold text-accent"
              >
                <ChevronLeft size={16} />
                Alterar pagamento ou cupom
              </button>
            </>
          )}
        </div>
      </main>

      <div className="fixed inset-x-0 z-40 flex items-center justify-center p-4" style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}>
        {flow.step === 1 ? (
          <Button
            variant="primary"
            isDisabled={!flow.selectedService || !!flow.selectedServiceBlockedMessage}
            className="h-15 w-full justify-center rounded-full text-lg font-semibold"
            onPress={handleContinue}
          >
            Continuar
            <ArrowRight />
          </Button>
        ) : flow.step === 2 ? (
          <Button
            variant="primary"
            isDisabled={!flow.selectedDate || !flow.selectedSlot}
            className="h-15 w-full justify-center rounded-full text-lg font-semibold"
            onPress={handleContinue}
          >
            Continuar
            <ArrowRight />
          </Button>
        ) : flow.step === 3 ? (
          <Button
            variant="primary"
            isDisabled={!flow.paymentMethod}
            className="h-15 w-full justify-center rounded-full text-lg font-semibold"
            onPress={handleContinue}
          >
            Continuar
            <ArrowRight />
          </Button>
        ) : (
          <ConfirmSlider boxRef={sliderBoxRef} onConfirm={handleSlideConfirm} onDone={handleSlideDone} onError={handleSlideError} />
        )}
      </div>

      {doneOverlay && (
        <BookingDoneOverlay
          origin={doneOverlay.origin}
          expanded={doneOverlay.expanded}
          summary={doneOverlay.summary}
          onWhatsApp={confirmOnWhatsApp}
          onLater={goToAppointments}
        />
      )}
    </div>
  );
}
