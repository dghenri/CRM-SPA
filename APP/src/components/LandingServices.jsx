import { useState, useEffect } from "react";
import { Button, toast, Card, Spinner } from "@heroui/react";
import { Clock, Tag, Heart, CircleAlert, OctagonAlert  } from "lucide-react";
import { fetchServices } from "../api/services";

function ClientServiceCard({ service, favorited, onToggleFavorite, onBook }) {
  return (
    <div className="group pb-2">
      {/* Bezel branco em volta de toda a foto/infos, como uma moldura */}
      <div className="rounded-[28px] bg-white p-[6px] shadow-lg ring-1 ring-black/5 transition-shadow duration-300 group-hover:shadow-2xl transition-transform duration-500 ease-out group-hover:scale-105">
        <Card className="relative h-[420px] overflow-hidden rounded-[22px] border-none">
          {/* Foto de fundo — ocupa o card inteiro como um background */}
          <img
            src={service.image}
            alt={service.title}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* favorite button */}
          <Button
            isIconOnly
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(service.id);
            }}
            aria-label="Favorite"
            className={`absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
              favorited
                ? "bg-danger text-white"
                : "bg-transparent text-white hover:bg-white/40"
            }`}
          >
            <Heart className="size-5" fill={favorited ? "currentColor" : "none"} />
          </Button>

          {/* Máscara de blur/gradiente atrás do texto — só na parte de baixo da foto.
              Sem o transform 3D do tilt antigo atrapalhando, o backdrop-blur volta
              a funcionar normalmente aqui. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[54%] overflow-hidden rounded-b-[22px] backdrop-blur-md [mask-image:linear-gradient(to_top,black_35%,transparent_100%)]">
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
          </div>

          {/* Conteúdo textual */}
          <Card.Content className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-5 text-white">
            <div>
              <h3 className="font-serif text-2xl font-bold leading-tight">
                {service.title}
              </h3>
              {service.category && (
                <p className="mt-0.5 text-sm text-white/70">{service.category}</p>
              )}
            </div>

            {/* Linha de infos com ícones, no estilo "from $120 · JFK" */}
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-white/85">
                <Clock size={15} />
                {service.duration} min
              </span>
            </div>

            {/* Botão dentro do card, colado na base — sem vazar pela borda */}
            <Button
              variant="light"
              className="mt-1 w-full justify-center rounded-full bg-white font-semibold text-foreground shadow-lg hover:bg-white/90"
              onPress={() => onBook(service)}
            >
              Agendar
            </Button>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

function MoreServicesTile({ count }) {
  return (
    <div className="group pb-2">
      <div className="rounded-[28px] bg-white p-[6px] shadow-lg ring-1 ring-black/5">
        <Card className="flex h-[420px] items-center justify-center rounded-[22px] border-none bg-primary-50">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="font-serif text-2xl font-bold text-foreground">E mais...</p>
            <p className="text-sm text-default-500">
              +{count} {count === 1 ? "procedimento" : "procedimentos"} disponíveis
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Página do cliente
//
// Em produção, troque INITIAL_SERVICES por dados vindos da sua API (os
// mesmos que o admin edita), filtrando por `available: true` no backend.
//
// Requer <Toast.Provider /> montado uma vez na raiz do app (ex: App.jsx)
// para o toast() funcionar.
// -----------------------------------------------------------------------
export default function ClientServicesPage() {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    let cancelled = false;

    fetchServices()
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Erro ao carregar procedimentos.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = (id) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleBook = (service) => {
    toast("Agendamento iniciado", {
      description: service.title,
      variant: "success",
    });
  };

  const visibleServices = services.filter((s) => s.available);

  const MAX_VISIBLE = 5;
  const displayedServices = visibleServices.slice(0, MAX_VISIBLE);
  const hiddenCount = visibleServices.length - displayedServices.length;

  return (
    <section className="w-full p-5">
      <div className="mb-8 text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
          Nossos
        </p>
        <h2 className="font-serif text-4xl font-bold text-foreground">Procedimentos</h2>
        <p className="mx-auto mt-2 max-w-xl text-default-500">
          Escolha o cuidado ideal para você e agende em poucos cliques.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center font-semibold items-center gap-2">
          <Spinner color="current" />
          <p className="text-center text-muted">Carregando procedimentos...</p>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center text-danger gap-2">
          <OctagonAlert />
          <p className="text-center font-semibold">
            {console.log(loadError)} Não foi possivel carregar, tente novamente em instantes.
          </p>
        </div>
        
      ) : visibleServices.length > 0 ? (
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {displayedServices.map((service) => (
            <ClientServiceCard
              key={service.id}
              service={service}
              favorited={favorites.includes(service.id)}
              onToggleFavorite={toggleFavorite}
              onBook={handleBook}
            />
          ))}
          {hiddenCount > 0 && <MoreServicesTile count={hiddenCount} />}
        </div>
      ) : (
        <div className="flex items-center justify-center text-warning gap-2">
          <CircleAlert />
          <p className="text-center ">
            Nenhum serviço disponível no momento.
          </p>
        </div>
      )}
    </section>
  );
}
