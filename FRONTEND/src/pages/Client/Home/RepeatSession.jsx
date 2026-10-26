import { useNavigate } from "react-router-dom";
import { Avatar, Button } from "@heroui/react";
import { Clock, RotateCw, UserRound } from "lucide-react";
import { assetUrl } from "../../../api/api";
import { formatPrice, formatTimeAgo, getInitials, pickLastCompleted } from "./homeUtils";

// "Agendar de novo": o último procedimento concluído (e que ainda está disponível).
// Abre a página do procedimento, de onde o cliente já agenda.
export default function RepeatSession({ appointments }) {
  const navigate = useNavigate();
  const last = pickLastCompleted(appointments);
  if (!last) return null;

  const { service, professional } = last;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-overlay p-3 drop-shadow-sm">
      {service.image ? (
        <img src={service.image} alt={service.title} className="size-20 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-surface-secondary">
          <RotateCw className="size-6 text-muted" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Sua última sessão foi {formatTimeAgo(last.date)}
        </p>
        <h3 className="truncate font-serif text-base font-bold leading-tight">{service.title}</h3>

        <div className="mt-1 flex items-center gap-3 text-xs font-semibold text-default-600">
          <span>{formatPrice(service.price)}</span>
          <span className="flex items-center gap-1">
            <Clock size={12} className="text-accent-hover" />
            {service.duration} min
          </span>
        </div>

        {professional?.name && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Avatar size="sm" className="size-5">
              {professional.avatarUrl && <Avatar.Image alt={professional.name} src={assetUrl(professional.avatarUrl)} />}
              <Avatar.Fallback className="text-[9px]">
                {getInitials(professional.name) || <UserRound className="size-3" />}
              </Avatar.Fallback>
            </Avatar>
            <span className="truncate text-xs font-medium text-muted">{professional.name}</span>
          </div>
        )}
      </div>

      <Button size="sm" className="shrink-0" onPress={() => navigate(`/user/services/${service.id}`)}>
        Agendar de novo
      </Button>
    </div>
  );
}
