import React from 'react'
import { useNavigate } from "react-router-dom";
import { SearchField, Avatar, Button, toast } from "@heroui/react";
import { Calendar, ClipboardList, Heart, History, Tag, MessageCircle } from "lucide-react";
import UserSuggestions from './UserSuggestions'
import { getGreeting } from "../../../utils/dateGreeting";
import { useAuth } from "../../../context/AuthContext";
import { assetUrl } from '../../../api/api';
import { WHATSAPP_NUMBER } from '../config';
import UserDiscovery from './UserDiscovery';
import NotificationsDrawer from './NotificationsDrawer';

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
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-overlay border-b border-border/50 p-5 pb-0">
        <div className="flex gap-4">
          <Avatar className="size-14 rounded-full border border-border">
            {user?.avatarUrl && <Avatar.Image alt={user?.name} src={assetUrl(user.avatarUrl)} />}
            <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted font-semibold">
              {greeting}!
            </p>
            <h1 className="mb-4 shrink-0 text-lg font-bold text-overlay-foreground -mt-1">
              {getShortName(user?.name)}
            </h1>
          </div>
        </div>

        {/* sino de notificações (dados reais: alertas de perfil/cupom + avisos da equipe) */}
        <NotificationsDrawer />
      </div>

      <div>
        <div className="grid grid-cols-3 gap-3 place-items-center">
          {quickActions.map(({ label, icon: Icon, onPress }) => (
            <Button
              key={label}
              className="h-25 w-full bg-overlay text-default-foreground text-[12px] font-semibold text-wrap leading-none flex flex-col items-center justify-center gap-1 drop-shadow-sm rounded-2xl"
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
