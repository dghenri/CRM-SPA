import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, NavLink, useNavigate } from "react-router-dom";
import ThemeSwitcher from "../components/ThemeSwitcher"
import { useAuth } from "../context/AuthContext";
import { assetUrl } from "../api/api";
import KeyHint from "../components/KeyHint";

import {
  Avatar,
  AlertDialog,
  Button,
  Disclosure,
  Dropdown,
  Label,
  Separator,
  Badge,
  Tooltip,
} from "@heroui/react";

import {
  ChevronUp,
  Settings,
  PanelLeft,
  LogOut as LogOutIcon,
  UserRoundCog,
} from 'lucide-react';

import {
  mainItems,
  usersItems,
  managementItems,
} from "../data/navigation";

function SLabel({
  open,
  children,
  className = "",
}) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${
        open
          ? "max-w-50 opacity-100 delay-10"
          : "max-w-0 opacity-0 ml-0"
      } ${className}`}
    >
      {children}
    </span>
  );
}

// Gera as iniciais a partir do nome (ex: "Junior Garcia" -> "JG")
function getInitials(name) {
  if (!name) return "";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function getShortName(name) {
  if (!name) return "";
  return name.split(" ").filter(Boolean).slice(0, 2).join(" ");
}

const USER_STATUS_COLOR = {
  Active: "success",
  Inactive: "danger",
  OnLeave: "warning",
};

function getStatusColor(status) {
  return USER_STATUS_COLOR[status] ?? "default";
}

// Estado aberto/fechado da sidebar guardado no navegador (sobrevive ao F5)
const SIDEBAR_STORAGE_KEY = "viva-bem-spa:sidebar-open";

function readSidebarOpen() {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved === null ? null : saved === "true";
  } catch {
    return null; // localStorage bloqueado: segue com o padrão
  }
}

// true em telas menores que o breakpoint "md" do Tailwind (768px): celular
const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export default function Sidebar ({
  open,
  setOpen,
}) {
  const [expanded, setExpanded] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const isMobile = useIsMobile();
  // No celular a sidebar vira uma gaveta: quando aberta, sempre mostra os textos (nunca a versão só de ícones)
  const showFull = isMobile || open;
  const location = useLocation();
  const usersRoutes = usersItems.map(item => item.to);
  const isUsersRoute = usersRoutes.includes(location.pathname);
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  // Item visível se: (sem "roles" OU o cargo está na lista) E (sem "permission" OU a pessoa tem a permissão)
  const canSee = (item) =>
    (!item.roles || item.roles.includes(user?.role)) && (!item.permission || can(item.permission));
  const visibleMainItems = mainItems.filter(canSee);
  const visibleUsersItems = usersItems.filter(canSee);
  const visibleManagementItems = managementItems.filter(canSee);
  const showManagement = visibleUsersItems.length > 0 || visibleManagementItems.length > 0;

  useEffect(() => {
    if (!showFull) {
      setExpanded(false);
    }
  }, [showFull]);

  // Restaura o estado salvo antes da primeira pintura (evita "piscar" aberta e fechar)
  const persistReady = useRef(false);
  useLayoutEffect(() => {
    if (isMobile) {
      setOpen(false); // celular: a gaveta sempre começa fechada
      return;
    }
    const saved = readSidebarOpen();
    if (saved !== null) setOpen(saved);
  }, [setOpen, isMobile]);

  // Salva a cada mudança (a primeira execução é a montagem: não sobrescreve o valor salvo)
  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    if (isMobile) return; // abrir/fechar a gaveta no celular não muda a preferência do desktop
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
    } catch {
      /* sem localStorage: só não lembra na próxima visita */
    }
  }, [open, isMobile]);

  // celular: fecha a gaveta ao trocar de página, com Esc, e trava a rolagem do fundo enquanto aberta
  useEffect(() => {
    if (isMobile) setOpen(false);
  }, [location.pathname, isMobile, setOpen]);

  useEffect(() => {
    if (!isMobile || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobile, open, setOpen]);

  const avatarSrc = assetUrl(user?.avatarUrl);

  const handleMenuAction = (key) => {
    if (key === "staff") {
      navigate("/staff");
    }
    if (key === "profile") {
      navigate("/staff/profile");
    }
    if (key === "settings") {
      navigate("/staff/settings");
    }
    if (key === "logout") {
      setIsLogoutOpen(true);
      return;
    };
    
    // outros itens (settings, new-project) podem receber
    // navigate() aqui conforme forem implementados
  };

  return (
    <>
    {/* celular: "marcador de página" colado na borda esquerda, embaixo, esticado para a direita */}
    {isMobile && !open && (
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-0 z-30 flex h-11 items-center gap-2 rounded-r-2xl border border-l-0 border-border bg-overlay pl-3 pr-6 text-sm font-semibold text-foreground shadow-lg transition-transform duration-200 active:translate-x-1"
      >
        <PanelLeft className="size-5" aria-hidden="true" />
        Menu
      </button>
    )}

    {/* celular: fundo escurecido, toque fora fecha */}
    {isMobile && open && (
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
      />
    )}

    <aside
      inert={isMobile && !open ? true : undefined}
      className={`flex shrink-0 flex-col gap-3 bg-background transition-all duration-300 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-72 max-md:max-w-[85vw] max-md:overflow-y-auto max-md:shadow-2xl ${
        open ? "md:w-70" : "max-md:-translate-x-full md:w-16"
      }`}
    >
      {/* Brand */}
      <div className="flex items-center justify-between mt-3 px-4 py-2.5">
          
        <div className="flex items-center gap-2">
          {showFull ? (
            <img className="size-11" src="/LotusIcon.svg" alt="" />
          ) : (
            <Tooltip delay={0}>
              <Button
                isIconOnly
                variant="ghost"
                onPress={() => setOpen((v) => !v)}
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="size-5" />
              </Button>
              <Tooltip.Content showArrow placement="bottom">
                <Tooltip.Arrow />
                <p className="font-semibold">Expandir</p>
              </Tooltip.Content>
            </Tooltip>
          )}

          <SLabel open={showFull} className="font-bold">
            Viva Bem SPA
          </SLabel>
        </div>

        {showFull && (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => setOpen(false)}
              aria-label="Close sidebar"
            >
              <PanelLeft className="size-5" />
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              <p className="font-semibold">Encolher</p>
            </Tooltip.Content>
          </Tooltip>
        )}
      </div>

      {/* Main nav */}
      <div className="flex flex-col gap-2 p-2.5">
        {visibleMainItems.map(({ key, label, tooltip, Icon, to, badge }) => (
          <Tooltip
            key={key}
            isDisabled={showFull}
            delay={0}
          >
            <Tooltip.Trigger>
              <NavLink
                key={key}
                to={to}
                end={to === "/staff"}
                className={({ isActive }) =>
                  `flex items-center rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-default"
                      : "hover:bg-default text-field-placeholder"
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="size-5 shrink-0" />

                  <SLabel
                    open={showFull}
                    className="font-semibold"
                  >
                    {label}
                  </SLabel>
                </div>

                {showFull && badge > 0 && (
                  <span className="ml-auto flex min-w-5 h-5 items-center justify-center rounded-full
                  bg-danger text-white text-xs font-semibold px-1">
                    {badge}
                  </span>
                )}

              </NavLink>
            </Tooltip.Trigger>
            {tooltip && (
              <Tooltip.Content showArrow placement="right">
                <Tooltip.Arrow />
                <p className="font-semibold">{tooltip}</p>
              </Tooltip.Content>
            )}
          </Tooltip>
        ))}
      </div>

      {/* Management - só aparece se a pessoa puder ver pelo menos um item (cargo/permissão) */}
      {showManagement && (
      <>
      <SLabel open={showFull} className="mt-2 ml-2 px-2 text-xs font-medium uppercase tracking-wide text-muted">
        Management
      </SLabel>

      <div className="rounded-md px-2 py-1.5">
        {visibleUsersItems.length > 0 && (
        <Disclosure
          isDisabled={!showFull}
          expanded={showFull && (isUsersRoute || expanded)}
          onExpandedChange={setExpanded}
        >
          <Disclosure.Heading>
            <Disclosure.Trigger
            className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-default">
              <div className="flex px-2 items-center gap-2">
                <UserRoundCog className="size-5 text-field-placeholder" />
                <SLabel open={showFull} className="font-semibold text-field-placeholder">Usuários</SLabel>
              </div>
              <SLabel open={showFull}><Disclosure.Indicator /></SLabel>
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content className={!showFull ? "hidden" : ""}>
            <Disclosure.Body className="ml-3 flex flex-col gap-0.5">
              {visibleUsersItems.map(({ key, label, Icon, to }) => (
                <NavLink
                  key={key}
                  to={to}
                  className={({ isActive }) => 
                    `flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold transition-colors ${ 
                    isActive
                      ? "bg-default"
                      : "hover:bg-default text-field-placeholder"
                    }`
                  }
                >
                  <Icon className="size-4.5 text-default-500" />
                  <SLabel open={showFull}>{label}</SLabel>
                </NavLink>
              ))}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
        )}

        <div className="ml-1 flex flex-col gap-0.5">
          {visibleManagementItems.map(({ key, label, tooltip, Icon, to }) => (
            <Tooltip
              key={key}
              isDisabled={showFull}
              delay={0}
            >
              <Tooltip.Trigger>
                <NavLink
                  key={key}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                      isActive
                        ? "bg-default"
                        : "hover:bg-default text-field-placeholder"
                    }`
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />

                  <SLabel
                    open={showFull}
                    className="font-semibold"
                  >
                    {label}
                  </SLabel>
                </NavLink>
              </Tooltip.Trigger>
              {tooltip && (
                <Tooltip.Content showArrow placement="right">
                  <Tooltip.Arrow />
                  <p className="font-semibold">{tooltip}</p>
                </Tooltip.Content>
              )}
            </Tooltip>
          ))}
        </div>
      </div>
      </>
      )}

      {/* <SLabel open={showFull}>
        <Label>Theme</Label>
        <ThemeSwitcher />
      </SLabel> */}

      {/* USER */} 
      <div className=" p-1 mt-auto">
        <Separator className="mb-1" />
        <Dropdown>
          <Dropdown.Trigger asChild className="w-full px-1 justify-start rounded-full">
            <div
              role="button"
              tabIndex={0}
              className={`flex items-center w-full h-auto py-2 rounded-xl cursor-pointer transition-all duration-200 hover:bg-default
              ${!showFull ? "justify-center px-0" : "justify-start px-3"}`}
            >
              <Badge.Anchor>
                <Avatar size="sm">
                  <Avatar.Image
                    alt={user?.name || "User"}
                    src={avatarSrc}
                  />
                  <Avatar.Fallback delayMs={600}>{getInitials(user?.name)}</Avatar.Fallback>
                </Avatar>
                <Badge color={getStatusColor(user?.status)} placement="bottom-right" size="sm" />
              </Badge.Anchor>
            
              {showFull && (
                <SLabel open={showFull} className="flex w-full items-center justify-between gap-2 ml-3">
                  <span className="font-semibold">{getShortName(user?.name)}</span>
                  <ChevronUp size={20} />
                </SLabel>
              )}

            </div>
          </Dropdown.Trigger>
          <Dropdown.Popover className="rounded-2xl">
            <div className="px-3 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <Avatar.Image
                    alt={user?.name || "Usuário"}
                    src={avatarSrc}
                  />
                  <Avatar.Fallback delayMs={600}>{getInitials(user?.name)}</Avatar.Fallback>
                </Avatar>
                <div className="flex flex-col gap-0">
                  <p className="text-sm leading-5 font-medium">{getShortName(user?.name)}</p>
                  <p className="text-xs leading-none text-muted">{user?.email}</p>
                </div>
              </div>
            </div>
            <Dropdown.Menu onAction={handleMenuAction}>

              <Dropdown.Item id="staff" textValue="staff">
                <Label>Dashboard</Label>
              </Dropdown.Item>

              <Dropdown.Item id="profile" textValue="Profile">
                <Label>Perfil</Label>
              </Dropdown.Item>

              <Dropdown.Item id="settings" textValue="Settings">
                <div className="flex w-full items-center justify-between gap-2">
                  <Label>Configurações</Label>
                  <Settings className="size-4 text-muted" />
                </div>
              </Dropdown.Item>

              <Dropdown.Item id="logout" textValue="Logout" variant="danger">
                <div className="flex w-full items-center justify-between gap-2">
                  <Label>Sair</Label>
                  <LogOutIcon className="size-4 text-danger" />
                </div>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <AlertDialog>
          {/* o AlertDialog do HeroUI ignora o Esc por padrão; aqui o Esc cancela, como nos demais modais */}
          <AlertDialog.Backdrop isOpen={isLogoutOpen} onOpenChange={setIsLogoutOpen} isKeyboardDismissDisabled={false}>
            <AlertDialog.Container>
              <AlertDialog.Dialog>
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>Sair da conta?</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <p>
                    Você precisará entrar novamente para acessar sua conta.
                    Alterações não salvas serão perdidas.
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">
                    Cancelar
                    <KeyHint>Esc</KeyHint>
                  </Button>
                  <Button
                    slot="close"
                    variant="danger"
                    onPress={() => { logout() }}
                  >
                    Sair
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </div>
    </aside>
    </>
  );
}
