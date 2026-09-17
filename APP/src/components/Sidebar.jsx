import React, { useState, useEffect } from "react";
import { useLocation, NavLink, Link, Navigate, useNavigate } from "react-router-dom";
import ThemeSwitcher from "../components/ThemeSwitcher"
import { useAuth } from "../context/AuthContext";

import {
  Avatar,
  AlertDialog,
  Button,
  Disclosure,
  Dropdown,
  Label,
  ListBox,
  ListBoxItem,
  Separator,
  Badge,
  Tooltip,

} from "@heroui/react";

import {
  House,
  CalendarCheck,
  Globe,
  File as FileIcon,
  BookUser,
  Paintbrush,
  Users,
  Plus,
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

export default function Sidebar ({
  open,
  setOpen,
}) {
  const [expanded, setExpanded] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const location = useLocation();
  const usersRoutes = usersItems.map(item => item.to);
  const isUsersRoute = usersRoutes.includes(location.pathname);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isMajorAdmin = user?.role === "MajorAdmin";
  // Item sem "roles" definido fica visível pra qualquer cargo
  const visibleMainItems = mainItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role)
  );

  useEffect(() => {
    if (!open) {
      setExpanded(false);
    }
  }, [open]);

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
    <aside
      className={`flex shrink-0 flex-col gap-3 bg-background transition-all duration-300 ${
        open ? "w-70" : "w-16"
      }`}
    >
      {/* Brand */}
      <div className="flex items-center justify-between mt-3 px-4 py-2.5">
          
        <div className="flex items-center gap-2">
          {open ? (
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

          <SLabel open={open} className="font-bold">
            Viva Bem SPA
          </SLabel>
        </div>

        {open && (
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
            isDisabled={open}
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
                    open={open}
                    className="font-semibold"
                  >
                    {label}
                  </SLabel>
                </div>

                {open && badge > 0 && (
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

      {/* Spaces - seção inteira só aparece pra MajorAdmin */}
      {isMajorAdmin && (
      <>
      <SLabel open={open} className="mt-2 ml-2 px-2 text-xs font-medium uppercase tracking-wide text-muted">
        Management
      </SLabel>

      <div className="rounded-md px-2 py-1.5">
        <Disclosure
          isDisabled={!open}
          expanded={open && (isUsersRoute || expanded)}
          onExpandedChange={setExpanded}
        >
          <Disclosure.Heading>
            <Disclosure.Trigger
            className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-default">
              <div className="flex px-2 items-center gap-2">
                <UserRoundCog className="size-5 text-field-placeholder" />
                <SLabel open={open} className="font-semibold text-field-placeholder">Usuários</SLabel>
              </div>
              <SLabel open={open}><Disclosure.Indicator /></SLabel>
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content className={!open ? "hidden" : ""}>
            <Disclosure.Body className="ml-3 flex flex-col gap-0.5">
              {usersItems.map(({ key, label, Icon, to }) => (
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
                  <SLabel open={open}>{label}</SLabel>
                </NavLink>
              ))}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <div className="ml-1 flex flex-col gap-0.5">
          {managementItems.map(({ key, label, tooltip, Icon, to }) => (
            <Tooltip
              key={key}
              isDisabled={open}
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
                    open={open}
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

      <SLabel open={open}>
        <Label>Theme</Label>
        <ThemeSwitcher />
      </SLabel>

      {/* USER */} 
      <div className=" p-1 mt-auto">
        <Separator className="mb-1" />
        <Dropdown>
          <Dropdown.Trigger asChild className="w-full px-1 justify-start rounded-full">
            <div
              role="button"
              tabIndex={0}
              className={`flex items-center w-full h-auto py-2 rounded-xl cursor-pointer transition-all duration-200 hover:bg-default
              ${!open ? "justify-center px-0" : "justify-start px-3"}`}
            >
              <Badge.Anchor>
                <Avatar size="sm">
                  <Avatar.Image
                    alt={user?.name || "User"}
                    src="https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg"
                  />
                  <Avatar.Fallback delayMs={600}>{getInitials(user?.name)}</Avatar.Fallback>
                </Avatar>
                <Badge color={getStatusColor(user?.status)} placement="bottom-right" size="sm" />
              </Badge.Anchor>
            
              {open && (
                <SLabel open={open} className="flex w-full items-center justify-between gap-2 ml-3">
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
                    src="https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg"
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
          <AlertDialog.Backdrop isOpen={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
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
  );
}
