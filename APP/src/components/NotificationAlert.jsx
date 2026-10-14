import { Alert, Button, CloseButton } from "@heroui/react";

// Um estilo por status (as classes ficam escritas por extenso para o Tailwind enxergá-las).
const STYLES = {
  Default: {
    status: "default",
    box: "border-black/20 bg-linear-to-br from-black/10 via-surface to-surface-secondary dark:border-white/30 dark:from-white/15 dark:via-surface dark:to-white/5",
    glow: "bg-black/15 dark:bg-white/25",
    button: { variant: "tertiary", className: "" },
  },
  Accent: {
    status: "accent",
    box: "border-accent/20 bg-linear-to-br from-accent/10 via-surface to-surface-secondary dark:border-accent/30 dark:from-accent/15 dark:via-surface dark:to-accent/5",
    glow: "bg-accent/15 dark:bg-accent/25",
    button: { variant: "primary", className: "" },
  },
  Success: {
    status: "success",
    box: "border-success/20 bg-linear-to-br from-success/10 via-surface to-surface-secondary dark:border-success/30 dark:from-success/15 dark:via-surface dark:to-success/5",
    glow: "bg-success/15 dark:bg-success/25",
    button: { variant: "tertiary", className: "bg-success text-success-foreground" },
  },
  Warning: {
    status: "warning",
    box: "border-warning/20 bg-linear-to-br from-warning/10 via-surface to-surface-secondary dark:border-warning/30 dark:from-warning/15 dark:via-surface dark:to-warning/5",
    glow: "bg-warning/15 dark:bg-warning/25",
    button: { variant: "tertiary", className: "bg-warning text-warning-foreground" },
  },
  Danger: {
    status: "danger",
    box: "border-danger/20 bg-linear-to-br from-danger/10 via-surface to-surface-secondary dark:border-danger/30 dark:from-danger/15 dark:via-surface dark:to-danger/5",
    glow: "bg-danger/15 dark:bg-danger/25",
    button: { variant: "danger", className: "" },
  },
};

export const NOTIFICATION_STATUS_OPTIONS = [
  { id: "Default", label: "Informativo" },
  { id: "Accent", label: "Destaque" },
  { id: "Success", label: "Sucesso" },
  { id: "Warning", label: "Atenção" },
  { id: "Danger", label: "Urgente" },
];

function formatRelative(date) {
  if (!date) return "";
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

/**
 * Cartão de notificação (usado no sino do cliente e na prévia da página da equipe).
 * @param notification { status, title, description, actionLabel, actionPath, dismissible, read, createdAt }
 * @param onAction     chamado ao tocar no botão de ação
 * @param onDismiss    se informado (e a notificação for dispensável), mostra o X
 */
export default function NotificationAlert({ notification, onAction, onDismiss }) {
  const style = STYLES[notification.status] ?? STYLES.Default;
  const { variant, className } = style.button;
  const canDismiss = Boolean(onDismiss) && notification.dismissible !== false;
  const when = formatRelative(notification.createdAt);

  return (
    <Alert className={`relative overflow-hidden rounded-xl border shadow-sm ${style.box}`} status={style.status}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-8 -right-8 size-28 rounded-full blur-2xl ${style.glow}`}
      />
      <Alert.Indicator className="relative" />
      <Alert.Content className="relative">
        <Alert.Title className="flex items-center gap-2">
          {notification.title}
          {notification.read === false && (
            <span aria-label="Não lida" className="size-2 shrink-0 rounded-full bg-accent" />
          )}
        </Alert.Title>
        {notification.description && <Alert.Description>{notification.description}</Alert.Description>}
        {when && <p className="mt-1 text-xs text-muted">{when}</p>}
        {notification.actionLabel && notification.actionPath && (
          <Button
            className={`mt-3 ${className}`}
            size="sm"
            variant={variant}
            onPress={() => onAction?.(notification)}
          >
            {notification.actionLabel}
          </Button>
        )}
      </Alert.Content>
      {canDismiss && (
        <CloseButton
          variant="ghost"
          className="relative"
          aria-label="Dispensar"
          onPress={() => onDismiss(notification.id)}
        />
      )}
    </Alert>
  );
}
