import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, Avatar, Button, Chip, toast } from "@heroui/react";
import { CalendarCheck, CalendarPlus, Clock, UserRound } from "lucide-react";
import api, { assetUrl } from "../../../api/api";
import { formatCountdown, formatSessionWhen, getInitials, pickNextAppointment } from "./homeUtils";

// Card "Próxima sessão" da Home. Sem sessão marcada vira um convite pra agendar.
// `appointments` = GET /appointments/me (carregado na Home; null = ainda carregando).
export default function NextAppointmentCard({ appointments, onChanged }) {
  const navigate = useNavigate();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (appointments === null) {
    return <div className="h-40 animate-pulse rounded-2xl bg-overlay drop-shadow-sm" aria-hidden="true" />;
  }

  const next = pickNextAppointment(appointments);

  if (!next) {
    return (
      <div className="flex items-center gap-4 rounded-2xl bg-overlay p-4 drop-shadow-sm">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
          <CalendarPlus className="size-6 text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Nenhuma sessão marcada</p>
          <p className="text-xs font-medium text-muted">Toque em "Agendar horário" para marcar a sua próxima sessão.</p>
        </div>
      </div>
    );
  }

  const inProgress = !!next.startedAt;
  const professional = next.professional;

  async function handleCancel() {
    setIsCancelling(true);
    try {
      await api.delete(`/appointments/${next.id}`);
      toast.success("Sessão cancelada.");
      setIsCancelOpen(false);
      onChanged?.();
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível cancelar a sessão.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl bg-overlay p-4 drop-shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <CalendarCheck className="size-4" />
            Próxima sessão
          </span>
          <Chip size="sm" variant="soft" color={inProgress ? "success" : next.status === "Confirmed" ? "success" : "warning"}>
            {inProgress ? "Em andamento" : next.status === "Confirmed" ? "Confirmada" : "Aguardando confirmação"}
          </Chip>
        </div>

        <h3 className="font-serif text-lg font-bold leading-tight">{next.service?.title ?? next.title}</h3>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold">
          <span className="flex items-center gap-1.5">
            <Clock className="size-4 text-accent-hover" />
            {formatSessionWhen(next.date)}
          </span>
          {!inProgress && <span className="text-xs font-medium text-muted">{formatCountdown(next.date)}</span>}
        </div>

        {(professional?.name || next.professionalName) && (
          <div className="mt-3 flex items-center gap-2">
            <Avatar size="sm" className="size-7">
              {professional?.avatarUrl && <Avatar.Image alt={professional.name} src={assetUrl(professional.avatarUrl)} />}
              <Avatar.Fallback className="text-[10px]">
                {getInitials(professional?.name ?? next.professionalName) || <UserRound className="size-4" />}
              </Avatar.Fallback>
            </Avatar>
            <span className="text-sm font-medium text-muted">com {professional?.name ?? next.professionalName}</span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="tertiary" className="flex-1" onPress={() => navigate("/user/scheduling")}>
            Ver detalhes
          </Button>
          {!inProgress && (
            <Button variant="danger-soft" className="flex-1" onPress={() => setIsCancelOpen(true)}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <AlertDialog>
        <AlertDialog.Backdrop isOpen={isCancelOpen} onOpenChange={setIsCancelOpen} isKeyboardDismissDisabled={false}>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Cancelar esta sessão?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  {next.service?.title ?? next.title} — {formatSessionWhen(next.date)}. Essa ação não pode ser desfeita.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" isDisabled={isCancelling}>
                  Manter sessão
                </Button>
                <Button variant="danger" onPress={handleCancel} isPending={isCancelling}>
                  Cancelar sessão
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
