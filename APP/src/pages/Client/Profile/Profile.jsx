import React from 'react'
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { TermsCard } from './Terms';
import { WHATSAPP_NUMBER } from '../config';

import { Avatar, Button, Modal, Separator } from '@heroui/react';
import {
  DoorOpen, ChevronRight, BadgeCheck, LockKeyhole, MapPinned,
  BellRing, RectangleEllipsis, Headset, BookOpenText,
} from 'lucide-react';

// -----------------------------------------------------------------------
function ProfileMenuButton({ icon: Icon, label, to, onPress, danger = false }) {
  const navigate = useNavigate();

  const handlePress = () => {
    if (onPress) return onPress();
    if (to) navigate(to);
  };

  return (
    <Button
      variant="tertiary"
      className="flex h-18 w-full items-center justify-between bg-overlay"
      onPress={handlePress}
      isDisabled={!to && !onPress}
    >
      <div className="flex gap-2">
        <Icon className={danger ? "text-danger" : ""} />
        <h2 className={danger ? "text-danger" : ""}>{label}</h2>
      </div>
      <ChevronRight className={danger ? "text-danger" : ""} />
    </Button>
  );
}

// -----------------------------------------------------------------------
function TermsMenuTrigger() {
  return (
    <Modal>
      <Modal.Trigger className="flex h-18 w-full items-center justify-between bg-overlay px-4 text-left transition-colors hover:bg-surface-secondary">
        <div className="flex items-center gap-2">
          <BookOpenText size={16} />
          <h2 className="font-medium text-sm">Política de Privacidade</h2>
        </div>
        <ChevronRight size={16} />
      </Modal.Trigger>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="p-0 sm:max-w-100">
            {({ close }) => (
              <TermsCard
                className="border-none shadow-none"
                onAccept={close}
                onCancel={close}
                cancelLabel="Fechar"
              />
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// Uma seção = título (opcional) + lista de itens, com separador entre
// cada um renderizado automaticamente. Um item pode fornecer `render()`
// pra desenhar algo diferente do ProfileMenuButton padrão (caso do
// TermsMenuTrigger acima).
function ProfileSection({ title, items }) {
  return (
    <div>
      {title && (
        <h1 className="mb-2 font-medium text-sm text-muted tracking-wide uppercase">{title}</h1>
      )}
      <div className="h-auto bg-overlay rounded-2xl">
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {item.render ? item.render() : <ProfileMenuButton {...item} />}
            {i < items.length - 1 && <Separator className="bg-background" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

function buildWhatsAppUrl() {
  const message = `Olá, estou precisando de ajuda com: [DIGITE SEU PROBLEMA]`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// -----------------------------------------------------------------------
function buildProfileSections({ onOpenWhatsApp }) {
  return [
    {
      title: "Endereço e segurança",
      items: [
        { icon: MapPinned, label: "Endereços Salvos", to: "/user/addresses" },
        { icon: LockKeyhole, label: "Alterar Senha", to: "/user/change-password" },
        { icon: RectangleEllipsis, label: "Alterar PIN", to: "/user/change-pin" },
      ],
    },
    {
      title: "Mais",
      items: [
        { icon: BellRing, label: "Preferência de Notificações", to: "/user/notifications" },
        { label: "Política de Privacidade", render: () => <TermsMenuTrigger /> },
        { icon: Headset, label: "Ajuda e Suporte", onPress: () => window.open(buildWhatsAppUrl(), "_blank", "noopener,noreferrer") },
      ],
    },
  ];
}

const Profile = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}`, "_blank", "noopener,noreferrer");
  };

  const PROFILE_SECTIONS = buildProfileSections({ onOpenWhatsApp: openWhatsApp });

  return (
    <div className="flex h-full flex-col pt-34 pb-20 mx-6">
      {/* HEAD */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-overlay border-b border-neutral-100 p-5">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Perfil</h2>
          <span className="font-semibold">Configurações</span>
        </div>

        <Button
          isIconOnly
          size="lg"
          variant="ghost"
          className="size-15 rounded-full font-semibold"
          onPress={logout}
        >
          <DoorOpen className="size-8 text-danger" />
        </Button>
      </div>

      <div className="grid gap-10">
        {/* USER - dados reais do cliente logado, via AuthContext */}
        <div className="h-auto bg-overlay rounded-2xl">
          <Button
            variant="tertiary"
            className="flex h-30 w-full justify-between items-center bg-overlay rounded-2xl p-4"
            onPress={() => navigate("/user/account")}
          >
            <div className="flex gap-4">
              <Avatar className="h-20 w-20 rounded-full">
                {/* sem campo de avatar no schema do User ainda - por
                    enquanto só as iniciais do nome como fallback */}
                <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
              </Avatar>
              <div className="grid items-center">
                <h2 className="flex justify-start font-semibold -mb-4">
                  {loading ? "Carregando..." : user?.name || "Cliente"}
                </h2>
                <span className="text-muted">{loading ? "" : user?.email}</span>
              </div>
            </div>
            <div>
              <ChevronRight />
            </div>
          </Button>
        </div>

        {PROFILE_SECTIONS.map((section) => (
          <ProfileSection key={section.title} title={section.title} items={section.items} />
        ))}
      </div>
    </div>
  );
};

export default Profile;
