import React from 'react'
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { assetUrl } from '../../../api/api';
import { PendingAnchor, PendingMark, getPendingFields, useImageReady } from './ProfilePending';
import { TermsCard } from './Terms';
import ThemeSwitcher from "../../../components/ThemeSwitcher";
import { WHATSAPP_NUMBER } from '../config';

import { Avatar, Button, Modal, Separator, AlertDialog, Spinner } from '@heroui/react';
import {
  DoorOpen, ChevronRight, BadgeCheck, LockKeyhole, MapPinned,
  BellRing, RectangleEllipsis, Headset, BookOpenText, Phone,
  Cake, SunMoon,
} from 'lucide-react';

// -----------------------------------------------------------------------
function ProfileMenuButton({ icon: Icon, label, to, onPress, value, pending = false, danger = false }) {
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
        <PendingAnchor show={pending}>
          <Icon className={danger ? "text-danger" : ""} />
        </PendingAnchor>
        <h2 className={danger ? "text-danger" : ""}>{label}</h2>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="max-w-40 truncate text-sm font-normal text-muted">{value}</span>}
        <ChevronRight className={danger ? "text-danger" : ""} />
      </div>
    </Button>
  );
}

// -----------------------------------------------------------------------
function TermsMenuTrigger() {
  return (
    <Modal>
      <Modal.Trigger className="flex h-18 w-full items-center justify-between bg-overlay rounded-3xl px-4 text-left transition-colors hover:bg-surface-secondary">
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

function ThemeSelect() {
  return(
    <div className="flex min-h-18 w-full items-center justify-between gap-4 rounded-xl bg-overlay px-4">
      <div className="flex min-w-0 items-center gap-2">
        <SunMoon size={18} className="shrink-0" />
        <h2 className="text-sm font-medium">Tema</h2>
      </div>

      <div className="ml-auto flex shrink-0 items-center">
        <ThemeSwitcher />
      </div>
    </div>   
  )
}

// Uma seção = título (opcional) + lista de itens, com separador entre
// cada um renderizado automaticamente. Um item pode fornecer `render()`
// pra desenhar algo diferente do ProfileMenuButton padrão (caso do
// TermsMenuTrigger acima).
function ProfileSection({ title, items }) {
  return (
    <div>
      {title && (
        <h1 className="mb-2 font-medium text-sm text-muted tracking-wide">{title}</h1>
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

// "1990-05-17T00:00:00.000Z" -> "17/05/1990" (sem passar por Date, que deslocaria o dia pelo fuso)
function formatBirthdate(value) {
  const iso = value ? String(value).slice(0, 10) : "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

function buildWhatsAppUrl() {
  const message = `Olá, estou precisando de ajuda com: [DIGITE SEU PROBLEMA]`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// -----------------------------------------------------------------------
function buildProfileSections({ user, pendingFields }) {
  return [
    {
      title: "Configurações da conta",
      items: [
        { icon: MapPinned, label: "Endereços", to: "/user/account?editar=enderecos" },
        { icon: Phone, label: "Telefone", to: "/user/account?editar=telefone", value: user?.phone, pending: pendingFields.phone },
        { icon: Cake, label: "Data de nascimento", to: "/user/account?editar=nascimento", value: formatBirthdate(user?.birthdate), pending: pendingFields.birthdate },
        { icon: LockKeyhole, label: "Alterar Senha", to: "/user/account?editar=senha" },
      ],
    },
    {
      title: "Configurações do aplicativo",
      items: [
        { icon: BellRing, label: "Preferência de Notificações", to: "/user/account?editar=notificacoes" },
        { label: "Política de Privacidade", render: () => <TermsMenuTrigger /> },
        { label: "Tema", render: () => <ThemeSelect /> },
      ],
    },
    {
      title: "Suporte",
      items: [
        { icon: Headset, label: "Ajuda e Suporte", onPress: () => window.open(buildWhatsAppUrl(), "_blank", "noopener,noreferrer") },
      ],
    },
  ];
}

const Profile = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const pendingFields = getPendingFields(loading ? null : user);
  const avatarReady = useImageReady(assetUrl(user?.avatarUrl), { wait: !loading && !!user });
  const PROFILE_SECTIONS = buildProfileSections({ user, pendingFields });

  return (
    <div className="flex h-full flex-col pt-34 pb-20 mx-6">
      {/* HEAD */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-overlay border-b border-border/50 p-5">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Perfil</h2>
          <span className="font-semibold">Configurações</span>
        </div>

        <AlertDialog>
          <Button variant="danger-soft" className="text-danger" ><DoorOpen /> Sair</Button>
          <AlertDialog.Backdrop className="bg-overlay/50 dark:bg-overlay/60" variant="blur">
            <AlertDialog.Container>
              <AlertDialog.Dialog className="relative overflow-hidden border border-border/80 bg-surface shadow-2xl ring-1 ring-danger/10 sm:max-w-100 dark:border-border/90 dark:bg-surface dark:ring-danger/15">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-danger/6 to-transparent dark:from-danger/10"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-danger/35 to-transparent dark:via-danger/45"
                />
                <AlertDialog.Header className="relative">
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>Sair da sua conta?</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body className="relative">
                  <p className="text-muted">
                    Você será desconectado deste dispositivo. Alterações não salvas no{" "}
                    <strong className="text-foreground">Viva Bem SPA</strong> serão perdidas.
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">
                    Continuar conectado 
                  </Button>
                  <Button slot="close" variant="danger" onPress={logout}>Sair</Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </div>


      {loading || !avatarReady ? (
        <div className="flex justify-center py-24">
          <Spinner aria-label="Carregando" />
        </div>
      ) : (
      <div className="grid gap-10">
        <div className="h-auto bg-overlay rounded-2xl">
          <Button
            variant="tertiary"
            className="flex h-30 w-full justify-between items-center bg-overlay rounded-2xl p-4"
            onPress={() => navigate("/user/account?editar=nome")}
          >
            <div className="flex gap-4">
              <PendingAnchor show={!loading && pendingFields.photo} size="md">
              <Avatar className="h-20 w-20 rounded-full">
                {user?.avatarUrl && <Avatar.Image alt={user?.name} src={assetUrl(user.avatarUrl)} />}
                <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
              </Avatar>
              </PendingAnchor>
              <div className="grid items-center">
                <h2 className="flex items-center justify-start font-semibold -mb-4">
                  {loading ? "Carregando..." : user?.name || "Cliente"}
                  {!loading && pendingFields.gender && <PendingMark />}
                </h2>
                <span className="flex items-start text-muted">{loading ? "" : user?.email}</span>
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

       {/*  <div className="h-auto  rounded-2xl">
          <Button
            variant="tertiary"
            className="flex h-18 w-full items-center justify-between bg-danger-soft rounded-2xl"
          >
            <div className="flex gap-2">
              <DoorOpen className="text-danger" />
              <h2 className="text-danger">Sair</h2>
            </div>
            <ChevronRight className="text-danger" />
          </Button>
        </div> */}
      </div>
      )}
    </div>
  );
};

export default Profile;
