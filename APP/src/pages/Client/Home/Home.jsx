import React from 'react'
import { useNavigate } from "react-router-dom";
import { SearchField, Avatar, Button, Drawer, Alert, CloseButton, toast } from "@heroui/react";
import { Calendar, ClipboardList, Heart, History, Tag, MessageCircle, Bell, X } from "lucide-react";
import UserSuggestions from './UserSuggestions'
import { getGreeting, getFormattedDate } from "../../../utils/dateGreeting";
import { useAuth } from "../../../context/AuthContext";
import { assetUrl } from '../../../api/api';
import { WHATSAPP_NUMBER } from '../config';
import UserDiscovery from './UserDiscovery';

const greeting = getGreeting();

function getShortName(name) {
  if (!name) return "";
  return name.split(" ").filter(Boolean).slice(0, 2).join(" ");
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
  const message = `Olá, gostaria de tirar algumas dúvidas...`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/* const { full: formattedDate } = getFormattedDate(); */

const Home = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const handleNewAppointment = () => {
    navigate("/user/scheduling/new");
  };

  const AppointmentHistory = () => {
    navigate("/user/scheduling");
  };

  // Ações rápidas da home. Adicione/edite itens aqui sem mexer no JSX abaixo.
  // `icon` é opcional: se não for informado, o botão renderiza só o texto.
  const quickActions = [
    { label: "Agendar horário", icon: Calendar, onPress: handleNewAppointment },
    { label: "Meus agendamentos", icon: ClipboardList, onPress: () => {toast("Nada ainda")} }, 
    { label: "Favoritos", icon: Heart, onPress: () => {toast("Nada ainda")} },
    { label: "Histórico", icon: History, onPress: AppointmentHistory },
    { label: "Cupons", icon: Tag, onPress: () => navigate("/user/coupons") },
    { label: "Fale conosco", icon: MessageCircle, onPress: () => window.open(buildWhatsAppUrl(), "_blank", "noopener,noreferrer") },
  ];

  return (
    <div className="bg-background pt-28 pl-6 pr-6">
      {/* HEAD */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-overlay border-b border-neutral-100 p-5 pb-0">
        <div className="flex gap-4">
          <Avatar className="size-16 rounded-full">
            {user?.avatarUrl && <Avatar.Image alt={user?.name} src={assetUrl(user.avatarUrl)} />}
            <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
          </Avatar>
          <div>
            <p className="text-md text-muted font-semibold">
              {greeting}
            </p>
            <h1 className="mb-4 shrink-0 text-xl font-bold text-overlay-foreground -mt-2">
              {getShortName(user?.name)}!
            </h1>
          </div>
        </div>

        <Drawer>
          <Button variant="tertiary" className="bg-surface-tertiary rounded-lg size-12 mb-2 shrink-0">
            <Bell className="size-7 " />
          </Button>
          <Drawer.Backdrop>
            <Drawer.Content placement="right">
              <Drawer.Dialog className="w-md lg:w-md">
                <Drawer.Header className="relative mb-20">
                  {/* Posicionado para ficar exatamente sobre o Bell (pt-8 pr-6 do container + size-12 do botão) */}
                  <Button
                    slot="close"
                    variant="tertiary"
                    className="fixed top-10 right-8 rounded-lg size-10"
                  >
                    <X className="size-7" />
                  </Button>
                  <Drawer.Heading className="fixed top-12">Notificações</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body>
                  <div className="w-full max-w-xl gap-2">
                    <Alert
                      className="relative overflow-hidden rounded-xl border border-warning/20 bg-linear-to-br from-warning/10 via-surface to-surface-secondary shadow-sm dark:border-warning/30 dark:from-warning/15 dark:via-surface dark:to-warning/5"
                      status="warning"
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-warning/15 blur-2xl dark:bg-warning/25"
                      />
                      <Alert.Indicator className="relative text-warning" />
                      <Alert.Content className="relative">
                        <Alert.Title>Payment method expires soon</Alert.Title>
                        <Alert.Description>
                          Your Visa ending in 4242 expires on March 28. Update billing to avoid interrupting your
                          Pro subscription.
                        </Alert.Description>
                        <Button className="mt-3 sm:hidden" size="sm" variant="tertiary">
                          Update billing
                        </Button>
                      </Alert.Content>
                      <Button className="relative hidden shrink-0 sm:inline-flex" size="sm" variant="tertiary">
                        Update billing
                      </Button>
                      <CloseButton className="relative" />
                    </Alert>

                    {/* Accent - Important information with action */}
                    <Alert status="accent">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Update available</Alert.Title>
                        <Alert.Description>
                          A new version of the application is available. Please refresh to get the latest features
                          and bug fixes.
                        </Alert.Description>
                        <Button className="mt-2 sm:hidden" size="sm" variant="primary">
                          Refresh
                        </Button>
                      </Alert.Content>
                      <Button className="hidden sm:block" size="sm" variant="primary">
                        Refresh
                      </Button>
                    </Alert>
                  </div>
                </Drawer.Body>
                <Drawer.Footer>
                  {/* <Button slot="close">Confirm</Button> */}
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>

      <div>
        <div className="grid grid-cols-3 gap-3 place-items-center">
          {quickActions.map(({ label, icon: Icon, onPress }) => (
            <Button
              key={label}
              className="h-25 w-full bg-overlay text-black text-[12px] font-semibold text-wrap leading-none flex flex-col items-center justify-center gap-1 drop-shadow-sm rounded-2xl"
              onPress={onPress}
            >
              {Icon && <Icon className="size-6" />}
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <UserDiscovery />
      </div>

      <div className="mt-6">
        <UserSuggestions />
      </div>
      
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris in erat eros. Morbi tempor id erat eget elementum. Vestibulum in nisl efficitur tortor dictum mattis vitae nec magna. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Sed elementum accumsan lectus, sed porttitor ligula consequat eget. Duis ultricies consectetur elit sit amet semper. Cras sed ultricies sapien. Suspendisse lacinia libero quis sapien imperdiet volutpat. Aliquam vel convallis ligula, quis dictum odio. Donec libero nisl, sodales at ultricies vel, malesuada sed lorem.

        Pellentesque suscipit ligula vitae libero auctor viverra. Nam eget convallis nunc, in tincidunt arcu. Duis vel rhoncus nunc, et gravida augue. Pellentesque at ex fringilla, feugiat diam vitae, molestie risus. In luctus lacinia mi rutrum varius. Nam semper, mi a aliquet semper, libero risus ullamcorper dolor, at cursus enim felis non lorem. Vestibulum ornare dapibus neque, eu sagittis ipsum vestibulum eget. Maecenas auctor ligula ac purus egestas vestibulum et vel justo. In in purus porta velit vestibulum eleifend in vitae sapien. Vivamus eget viverra leo. Integer id libero eget nisi vulputate vulputate sit amet a velit. Sed et turpis rutrum libero suscipit scelerisque. Vestibulum ac mi nec lectus tempor vulputate eget nec sem. Curabitur varius semper magna, non sagittis lectus maximus et. Sed porta nisi non urna pretium, at suscipit urna maximus.

        Curabitur venenatis lacus in tortor pretium, non sollicitudin eros volutpat. In commodo tincidunt suscipit. Donec eleifend feugiat dolor at egestas. In sed mi pretium, euismod ex vitae, bibendum turpis. Morbi at dapibus lacus, ut ornare quam. Integer eget leo ornare, consectetur augue vulputate, tincidunt quam. Aenean convallis tincidunt dui accumsan accumsan. Vivamus urna lorem, aliquam ac risus at, blandit ultrices libero. Curabitur non varius nulla. Proin id nibh sed metus tincidunt rutrum.

        Vivamus fringilla dictum turpis, quis facilisis nulla molestie a. Praesent id volutpat augue. Aenean venenatis ac felis quis eleifend. Fusce non elit congue, bibendum purus quis, commodo neque. Nunc sollicitudin, neque ut luctus rhoncus, diam nisi pellentesque mi, eget aliquam sem justo nec purus. Duis in pharetra orci, quis placerat lectus. Aenean malesuada, arcu non commodo suscipit, erat libero volutpat metus, quis semper eros sapien eget nulla. Duis placerat aliquet justo, vitae fermentum tellus gravida at. Quisque dictum leo vel quam lobortis, sed gravida lectus gravida. Proin ut imperdiet libero. Ut eleifend ante ac nulla maximus mollis. Duis eleifend leo blandit interdum ullamcorper. Phasellus tristique eget lacus a vehicula. Pellentesque lacinia, elit vel varius egestas, neque quam finibus leo, sit amet molestie massa leo a ante.

        Proin enim metus, pretium accumsan volutpat a, dignissim non est. Maecenas sed congue lectus, vitae tempor mauris. Morbi consequat rutrum leo, tincidunt varius lacus sodales pellentesque. Morbi enim sem, sagittis vitae nibh in, ornare fringilla elit. Mauris rhoncus ut massa sit amet consequat. Etiam sit amet eros neque. Duis dignissim et augue quis convallis. Aenean faucibus risus ac est venenatis, vitae ultricies tortor gravida. Aenean auctor viverra cursus. Aliquam non leo id ante egestas pharetra.
      </p>
    </div>
  )
}

export default Home
