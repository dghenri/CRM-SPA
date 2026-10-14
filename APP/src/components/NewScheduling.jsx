import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Spinner, toast } from "@heroui/react";
import { CalendarCheck2, ChevronLeft, ArrowRight } from "lucide-react";
import { useBookingFlow } from "../hooks/useBookingFlow";
import { BookingStepOne, BookingStepTwo, BookingStepPayment, BookingStepConfirmation } from "./BookingFlowFields";
import Steps from "./Steps";
import MobileNav from "./MobileNav";

const STEP_LABELS = ["Procedimento", "Data e horário", "Pagamento", "Confirmação"];

export default function SchedulingNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: idFromRoute } = useParams();

  // O procedimento pode chegar de duas formas: pelo :id da rota (link antigo,
  // ex. compartilhado/favoritado) ou pelo state da navegação, vindo do botão
  // "Iniciar agendamento" da tela de detalhes (ServiceDetail).
  const initialServiceId = idFromRoute ?? location.state?.serviceId ?? null;

  const flow = useBookingFlow({ initialServiceId });

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

  const handleConfirm = async () => {
    try {
      const result = await flow.confirmBooking();

      if (!result.ok && result.conflict) {
        toast("Esse horário acabou de ser reservado", {
          description: "Escolha outro horário para continuar.",
          variant: "danger",
        });
        return;
      }

      toast("Agendamento realizado!", {
        description: result.discountAmount
          ? `${flow.selectedService.title} · ${flow.formattedDate} às ${flow.selectedSlot.label} · cupom aplicado (-${result.discountAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`
          : `${flow.selectedService.title} · ${flow.formattedDate} às ${flow.selectedSlot.label}.`,
        variant: "success",
      });

      if (result.couponFailed) {
        toast("O cupom não pôde ser aplicado", {
          description: "Seu agendamento foi confirmado normalmente.",
          variant: "danger",
        });
      }

      navigate("/user/scheduling", { replace: true });
    } catch (err) {
      toast("Não foi possível confirmar", {
        description: err.message || "Tente novamente em instantes.",
        variant: "danger",
      });
    }
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
            isDisabled={!flow.selectedService}
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
          <Button
            variant="primary"
            isDisabled={flow.isSubmitting}
            className="h-15 w-full justify-center rounded-full text-lg font-semibold"
            onPress={handleConfirm}
          >
            {flow.isSubmitting ? (
              <Spinner size="sm" color="current" />
            ) : (
              <>
                <CalendarCheck2 size={16} />
                Confirmar agendamento
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
