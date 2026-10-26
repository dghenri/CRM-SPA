import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Spinner, toast, Link } from "@heroui/react";
import { Clock, Tag, Heart, EyeOff, CircleAlert, OctagonAlert, Banknote } from "lucide-react";
import { fetchServices } from "../../../api/services";
import { fetchMyFavorites, addFavorite, removeFavorite } from "../../../api/favorites";

function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// -----------------------------------------------------------------------
// Card de recomendação (scroll lateral na home)
// Layout inspirado na referência: imagem no topo, infos embaixo em fundo
// branco, botão preto full-width + botão circular de favorito ao lado.
// -----------------------------------------------------------------------
function SuggestionCard({ service, favorited, onToggleFavorite, onSelect }) {
  return (
    <div className="group w-90 shrink-0 snap-center">
      <div className="overflow-hidden rounded-[26px] bg-overlay shadow-md ring-1 ring-black/5 transition-shadow duration-300 group-hover:shadow-xl">
        <div className="relative">
          <img
            src={service.image}
            alt={service.title}
            className={`h-56 w-full object-cover ${
              !service.available ? "grayscale opacity-70" : ""
            }`}
          />
          {!service.available && (
            <Chip size="sm" className="absolute left-3 top-3 bg-black/70 text-white">
              <EyeOff size={12} />
              Indisponível
            </Chip>
          )}
        </div>

        <div className="p-4">
          <h3 className="line-clamp-1 font-serif text-base font-bold leading-tight text-foreground">
            {service.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">{service.description}</p>

          <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-default-600">
            <span className="flex items-center gap-1">
              <Banknote  size={15} className="text-success-hover" />
              {formatPrice(service.price)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={13} className="text-accent-hover" />
              {service.duration} min
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="tertiary"
              className="flex-1 justify-center bg-foreground text-default rounded-full hover:bg-foreground/90"
              onPress={() => onSelect(service)}
            >
              Ver detalhes
            </Button>

            <Button
              isIconOnly
              aria-label="Favoritar"
              variant="secondary"
              className={`h-11 w-11 shrink-0 rounded-full border ${
                favorited
                  ? "border-0 bg-danger/10 text-danger"
                  : "border-default bg-transparent text-foreground hover:border-danger hover:text-danger"
              }`}
              onPress={() => onToggleFavorite(service.id)}
            >
              <Heart size={16} fill={favorited ? "currentColor" : "none"} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Seção da home com o scroll lateral de recomendações.
function RecommendedSection({ services, favorites, onToggleFavorite, onSelect }) {
  if (services.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between -ml-4">
        <h2 className="font-serif text-xl font-bold text-foreground">Sugestões</h2>
        <Link href="/user/services" className="text-xs md:text-sm font-semibold text-focus">
          Ver todos
        </Link>
      </div>

      <div
        className="-mx-7 flex gap-4 overflow-x-auto pl-2.5 pr-2 pb-3 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {services.map((service) => (
          <SuggestionCard
            key={service.id}
            service={service}
            favorited={favorites.includes(service.id)}
            onToggleFavorite={onToggleFavorite}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Página da home do usuário
//
// Ao clicar no botão "Ver detalhes", o cliente vai para a página de
// detalhes do serviço (/user/services/:id) — ver ServiceDetail.jsx.
//
// Os favoritos são buscados do backend (GET /users/me/favorites) ao
// montar e sincronizados a cada toggle (POST/DELETE
// /users/me/favorites/:id) — antes viviam só em state local e sumiam
// ao sair da home.
//
// Requer <Toast.Provider /> montado uma vez na raiz do app para o
// toast() funcionar.
// -----------------------------------------------------------------------
export default function UserHomePage() {
  const navigate = useNavigate();

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

  useEffect(() => {
    let cancelled = false;

    fetchMyFavorites()
      .then((favServices) => {
        if (!cancelled) setFavorites(favServices.map((s) => s.id));
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle otimista: atualiza a UI na hora, reverte se o backend falhar
  const toggleFavorite = async (id) => {
    const alreadyFavorited = favorites.includes(id);

    setFavorites((prev) =>
      alreadyFavorited ? prev.filter((f) => f !== id) : [...prev, id]
    );

    try {
      if (alreadyFavorited) {
        await removeFavorite(id);
      } else {
        await addFavorite(id);
      }
    } catch (err) {
      console.error(err);
      setFavorites((prev) =>
        alreadyFavorited ? [...prev, id] : prev.filter((f) => f !== id)
      );
    }
  };

  const goToServiceDetail = (service) => {
    navigate(`/user/services/${service.id}`);
  };

  const visibleServices = services.filter((s) => s.available);

  return (
    <section className="w-full p-4 pt-0">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10">
          <Spinner color="current" />
          <p className="text-sm font-semibold text-muted">Carregando sugestões</p>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center gap-2 py-10 text-danger">
          <OctagonAlert />
          <p className="text-sm font-semibold">{loadError}</p>
        </div>
      ) : visibleServices.length > 0 ? (
        <RecommendedSection
          services={visibleServices}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onSelect={goToServiceDetail}
        />
      ) : (
        <div className="flex items-center justify-center gap-2 py-10 text-warning">
          <CircleAlert />
          <p>Nenhum procedimento disponível no momento.</p>
        </div>
      )}
    </section>
  );
}
