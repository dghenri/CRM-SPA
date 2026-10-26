import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from "react-router-dom";
import { Avatar, Button } from "@heroui/react";
import { Calendar, Tag, MessageCircle } from "lucide-react";
import UserSuggestions from './UserSuggestions'
import { getGreeting } from "../../../utils/dateGreeting";
import { useAuth } from "../../../context/AuthContext";
import api, { assetUrl } from '../../../api/api';
import { WHATSAPP_NUMBER } from '../config';
import UserDiscovery from './UserDiscovery';
import NotificationsDrawer from './NotificationsDrawer';
import NextAppointmentCard from './NextAppointmentCard';
import FeaturedCoupon from './FeaturedCoupon';
import RepeatSession from './RepeatSession';
import FavoritesStrip from './FavoritesStrip';

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

  // Agendamentos do cliente (GET /appointments/me): alimentam "Próxima sessão" e "Agendar de novo".
  // null = carregando; em caso de erro segue com lista vazia (a Home não quebra).
  const [appointments, setAppointments] = useState(null);

  const loadAppointments = useCallback(() => {
    api
      .get("/appointments/me")
      .then((list) => setAppointments(Array.isArray(list) ? list : []))
      .catch((error) => {
        console.error(error);
        setAppointments([]);
      });
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Ações rápidas da home. Adicione/edite itens aqui sem mexer no JSX abaixo.
  // `icon` é opcional: se não for informado, o botão renderiza só o texto.
  // `primary` destaca a ação principal.
  // Só ficam aqui atalhos que NÃO existem na barra de baixo (Procedimentos, Agendamentos, Perfil)
  // nem como seção da própria Home (favoritos, próxima sessão).
  const quickActions = [
    { label: "Agendar horário", icon: Calendar, onPress: handleNewAppointment, primary: true },
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

      {/* PRÓXIMA SESSÃO (ou convite pra agendar) */}
      <NextAppointmentCard appointments={appointments} onChanged={loadAppointments} />

      {/* AÇÕES RÁPIDAS */}
      <div className="mt-6 grid grid-cols-3 gap-3 place-items-center">
        {quickActions.map(({ label, icon: Icon, onPress, primary }) => (
          <Button
            key={label}
            className={
              "h-25 w-full text-[12px] font-semibold text-wrap leading-none flex flex-col items-center justify-center gap-1 drop-shadow-sm rounded-2xl " +
              (primary ? "bg-accent text-accent-foreground" : "bg-overlay text-default-foreground")
            }
            onPress={onPress}
          >
            {Icon && <Icon className="size-6" />}
            {label}
          </Button>
        ))}
      </div>

      {/* NOVIDADES DA CLÍNICA (banners) */}
      <div className="mt-6">
        <UserDiscovery />
      </div>

      {/* CUPOM EM DESTAQUE (só aparece se houver cupom válido) */}
      <div className="mt-4 empty:hidden">
        <FeaturedCoupon />
      </div>

      {/* AGENDAR DE NOVO (só aparece depois da primeira sessão concluída) */}
      <div className="mt-4 empty:hidden">
        <RepeatSession appointments={appointments} />
      </div>

      {/* FAVORITOS (só aparece se houver) */}
      <div className="mt-6 empty:hidden">
        <FavoritesStrip />
      </div>

      <div className="mt-6">
        <UserSuggestions />
      </div>
    </div>
  )
}

export default Home
