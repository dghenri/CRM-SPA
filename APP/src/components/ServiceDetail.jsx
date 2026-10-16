import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Chip, Spinner, toast, Separator, } from "@heroui/react";
import {
  Heart,
  Share2,
  Clock,
  Tag,
  ShieldCheck,
  EyeOff,
  CalendarCheck2,
  OctagonAlert,
  Banknote,
} from "lucide-react";
import api from "../api/api";
import { fetchMyFavorites, addFavorite, removeFavorite } from "../api/favorites";
import MobileNav from "./MobileNav";
import { ageFromBirthdate, minAgeBlockMessage } from "../utils/age";

function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ServiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [service, setService] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [customerAge, setCustomerAge] = useState(null);

  // idade do cliente: bloqueia cedo os procedimentos com idade mínima
  // (a API também recusa o agendamento - isto só poupa o cliente de descobrir no fim)
  useEffect(() => {
    let cancelled = false;
    api
      .get("/users/me")
      .then((me) => {
        if (!cancelled) setCustomerAge(ageFromBirthdate(me?.birthdate));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const minAgeMessage = minAgeBlockMessage(service, customerAge);

  useEffect(() => {
    let cancelled = false;
    document.body.style.backgroundColor = 'var(--overlay)'; 

    api
      .get("/services")
      .then((data) => {
        if (cancelled) return;
        const found = data.find((s) => String(s.id) === String(id));
        if (found) {
          setService(found);
        } else {
          setLoadError("Procedimento não encontrado.");
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Erro ao carregar o procedimento.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      // limpa a cor ao sair da página
      document.body.style.backgroundColor = ''; 
      cancelled = true;
    };
  }, [id]);

  // Descobre se ESTE serviço já está nos favoritos do cliente logado.
  // Antes disso não existia - o coração sempre nascia "desmarcado" e o
  // estado só vivia em memória, então sumia ao sair da página.
  useEffect(() => {
    let cancelled = false;

    fetchMyFavorites()
      .then((favServices) => {
        if (!cancelled) {
          setFavorited(favServices.some((s) => String(s.id) === String(id)));
        }
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleBook = () => {
    if (minAgeMessage) return;
    navigate("/user/scheduling/new", { state: { serviceId: service.id } });
  };

  // Toggle otimista: atualiza a UI na hora, reverte se o backend falhar
  const toggleFavorite = async () => {
    const wasFavorited = favorited;
    setFavorited(!wasFavorited);

    try {
      if (wasFavorited) {
        await removeFavorite(id);
      } else {
        await addFavorite(id);
      }
    } catch (err) {
      console.error(err);
      setFavorited(wasFavorited);
    }
  };

  const actionButtons = (
    <div className="flex items-center gap-2">
      <Button
        isIconOnly
        size="lg"
        variant="ghost"
        aria-label="Favorite"
        className={`rounded-full ${
          favorited ? "text-danger hover:bg-danger/90" : "text-default-foreground border-0"
        }`}
        onPress={toggleFavorite}
      >
        <Heart className="size-6" fill={favorited ? "currentColor" : "none"} />
      </Button>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-overlay">
      <MobileNav onBack={() => navigate(-1)} title={"Detalhes"} rightSlot={actionButtons} />

      {/* pb-24 dá espaço pro conteúdo não ficar escondido atrás da barra
          fixa de agendamento (mesma lógica do pb-20 do Menu no layout) */}
      <main className="flex-1 overflow-y-auto pt-14 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <Spinner color="current" />
            <p className="text-sm font-semibold text-muted">Carregando procedimento</p>
          </div>
        ) : loadError || !service ? (
          <div className="flex items-center justify-center gap-2 py-16 text-danger">
            <OctagonAlert />
            <p className="text-sm font-semibold">{loadError || "Procedimento não encontrado."}</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <img
                src={service.image}
                alt={service.title}
                className={`h-152 -mt-17 w-full object-cover rounded-b-4xl ${
                  !service.available ? "grayscale opacity-70" : ""
                }`}
              />

              {!service.available && (
                <Chip size="sm" className="absolute bottom-4 left-4 bg-black/70 text-white">
                  <EyeOff size={12} />
                  Indisponível no momento
                </Chip>
              )}
            </div>

            <div className="px-5 pt-5">
              <h2 className="font-serif text-2xl font-bold text-foreground">{service.title}</h2>
              <span className="flex items-center h-5 mt-2 gap-2">
                <p className="text-sm text-muted font-medium">Procedimento estético</p>
                <Separator orientation="vertical" />
                <Chip variant="soft" color="accent" className="font-semibold">
                  <Clock size={13} />
                  {service.duration} min
                </Chip>
                <Chip
                  variant="soft"
                  color={service.available ? "success" : "danger"}
                  className="font-semibold"
                >
                  {service.available ? <ShieldCheck size={13} /> : <EyeOff size={13} />}
                  {service.available ? "Disponível" : "Indisponível"}
                </Chip>
              </span>
              

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center font-bold text-lg gap-2">
                  {formatPrice(service.price)}
                </span>
                {service.minAge ? (
                  <Chip variant="soft" color="warning" className="font-semibold">
                    A partir de {service.minAge} anos
                  </Chip>
                ) : null}
              </div>

              {minAgeMessage && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-danger/10 p-3 text-danger">
                  <OctagonAlert size={16} className="shrink-0" />
                  <p className="text-sm font-semibold">{minAgeMessage}</p>
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-default-500">
                  Descrição
                </h3>
                <p className="mt-2 text-base l leading-6 text-foreground/90">
                  {service.description}
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Fixo embaixo, igual ao Menu (que fica escondido nessa rota,
          então não tem conflito de z-index/sobreposição entre os dois). */}
      {service && !isLoading && (
        <div
          className="flex justify-center items-center fixed inset-x-0 bottom-2 z-40 p-4 pb-[env(safe-area-inset-bottom)]"
        >
          <Button
            variant="primary"
            isDisabled={!service.available || !!minAgeMessage}
            className="w-full bg- h-15 justify-center rounded-full font-semibold text-lg"
            onPress={handleBook}
          >
            <CalendarCheck2 size={16} />
            Iniciar agendamento
          </Button>
        </div>
      )}
    </div>
  );
}
