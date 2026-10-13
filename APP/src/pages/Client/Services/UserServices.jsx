import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Spinner } from "@heroui/react";
import { Clock, Heart, EyeOff, CircleAlert, OctagonAlert, Banknote } from "lucide-react";

function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// -----------------------------------------------------------------------
// Card de serviço — mesmo layout visual do UserSuggestions (imagem no
// topo, infos embaixo em fundo branco, botão preto full-width + botão
// circular de favorito ao lado), só que aqui o botão principal chama
// "Agendar" em vez de "Ver detalhes".
// -----------------------------------------------------------------------
function ServiceCard({ service, favorited, onToggleFavorite, onSelect }) {
  const navigate = useNavigate();

  const handleBook = () => {
    navigate("/user/scheduling/new", { state: { serviceId: service.id } });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(service)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(service);
      }}
      className="group w-full cursor-pointer"
    >
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
              <Banknote size={15} className="text-success-hover" />
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
              className="flex-1 justify-center rounded-full bg-foreground font-semibold text-default hover:bg-foreground/90"
              onPress={handleBook}
              onClick={(e) => e.stopPropagation()}
            >
              Agendar
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
              onClick={(e) => e.stopPropagation()}
            >
              <Heart size={16} fill={favorited ? "currentColor" : "none"} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Página completa de serviços do usuário (destino do "Ver todos" na
// home). Ao contrário do UserSuggestions, que é um carrossel horizontal
// com uma amostra de recomendações, aqui listamos todos os procedimentos
// disponíveis em grade.
//
// Os dados (services/isLoading/loadError), os filtros (searchQuery,
// categoryFilter, professionalFilter, favoritesOnly) e os favoritos
// (favorites/onToggleFavorite) são controlados pelo componente pai
// (Services.jsx) — que também é quem sincroniza os favoritos com o
// backend (GET/POST/DELETE /users/me/favorites). Este componente não
// guarda mais favoritos em state local, senão eles somem ao navegar
// pra outra página e voltar.
//
// Ao clicar num card ou no botão "Agendar", navegamos para a rota do
// procedimento (/user/services/:id) — ajuste conforme sua necessidade
// (por exemplo, para abrir direto um fluxo de agendamento).
// -----------------------------------------------------------------------
export default function UserServicesPage({
  services = [],
  isLoading = false,
  loadError = "",
  searchQuery = "",
  categoryFilter = [],
  professionalFilter = null,
  priceRange = null,
  favoritesOnly = false,
  favorites = [],
  onToggleFavorite = () => {},
}) {
  const navigate = useNavigate();

  const goToDetail = (service) => {
    navigate(`/user/services/${service.id}`);
  };

  const visibleServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return services.filter((s) => {
      if (!s.available) return false;
      if (query && !s.title?.toLowerCase().includes(query)) return false;
      if (categoryFilter.length > 0 && !categoryFilter.includes(s.category)) return false;
      if (professionalFilter && s.professional !== professionalFilter) return false;
      if (priceRange) {
        const price = Number(s.price);
        if (!Number.isFinite(price) || price < priceRange[0] || price > priceRange[1]) return false;
      }
      if (favoritesOnly && !favorites.includes(s.id)) return false;
      return true;
    });
  }, [
    services,
    searchQuery,
    categoryFilter,
    professionalFilter,
    priceRange,
    favoritesOnly,
    favorites,
  ]);

  return (
    <section className="w-full p-4">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10">
          <Spinner color="current" />
          <p className="text-sm font-semibold text-muted">Carregando procedimentos</p>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center gap-2 py-10 text-danger">
          <OctagonAlert />
          <p className="text-sm font-semibold">{loadError}</p>
        </div>
      ) : visibleServices.length > 0 ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-2">
          {visibleServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              favorited={favorites.includes(service.id)}
              onToggleFavorite={onToggleFavorite}
              onSelect={goToDetail}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-10 text-warning">
          <CircleAlert />
          <p>
            {favoritesOnly
              ? "Você ainda não favoritou nenhum procedimento."
              : services.length === 0
              ? "Nenhum procedimento disponível no momento."
              : "Nenhum procedimento encontrado para esta busca."}
          </p>
        </div>
      )}
    </section>
  );
}
