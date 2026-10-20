import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Drawer } from "@heroui/react";
import { Bell, BellOff, X } from "lucide-react";
import NotificationAlert from "../../../components/NotificationAlert";
import { useNotifications } from "../../../hooks/useNotifications";

/** Sino do cabeçalho da Home + gaveta com as notificações do cliente. */
export default function NotificationsDrawer() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, isLoading, refresh, dismiss, markAllRead } = useNotifications();

  const handleOpenChange = (next) => {
    setOpen(next);
    if (next) refresh(); // sempre mostra o que há de mais novo
    else markAllRead(); // fechou = leu
  };

  const handleAction = (notification) => {
    setOpen(false);
    markAllRead();
    navigate(notification.actionPath);
  };

  const bell = (
    <Button
      variant="tertiary"
      className="bg-surface-secondary rounded-xl size-12 mb-2 shrink-0"
      aria-label={unreadCount > 0 ? `Notificações (${unreadCount} novas)` : "Notificações"}
    >
      <Bell className="size-7" />
    </Button>
  );

  return (
    <Drawer isOpen={open} onOpenChange={handleOpenChange}>
      {unreadCount > 0 ? (
        <Badge.Anchor>
          {bell}
          <Badge
            color="danger"
            size="sm"
            placement="top-right"
            className="aspect-square size-5 min-h-0 min-w-0 justify-center rounded-full p-0 text-[10px] font-bold leading-none"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        </Badge.Anchor>
      ) : (
        bell
      )}
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-md lg:w-md">
            <Drawer.Header className="relative mb-15">
              <Button slot="close" variant="ghost" className="fixed top-8 right-6 size-10">
                <X className="size-7" />
              </Button>
              <Drawer.Heading className="fixed top-9">Notificações</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              <div className="w-full max-w-xl space-y-4">
                {items.map((notification) => (
                  <NotificationAlert
                    key={notification.id}
                    notification={notification}
                    onAction={handleAction}
                    onDismiss={dismiss}
                  />
                ))}

                {!isLoading && items.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
                    <BellOff className="size-8" />
                    <p className="text-sm font-semibold">Você não tem notificações</p>
                    <p className="text-xs">Avisos sobre suas sessões e novidades aparecem aqui.</p>
                  </div>
                )}
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
