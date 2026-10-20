import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Spinner } from "@heroui/react";
import { Clock, CircleAlert, OctagonAlert  } from "lucide-react";
import { fetchServices } from "../api/services";

function ClientServiceCard({ service }) {
  const navigate = useNavigate();

  return (
    <div className="group pb-2">
      {/* Bezel branco em volta de toda a foto/infos, como uma moldura */}
      <div className="rounded-[28px] bg-background p-1.5 shadow-lg ring-1 ring-black/5 group-hover:shadow-2xl transition-transform duration-500 ease-out group-hover:scale-105">
        <Card className="relative h-150 overflow-hidden rounded-[22px] border-none">
          {/* Foto de fundo — ocupa o card inteiro como um background */}
          <img
            src={service.image}
            alt={service.title}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Máscara de blur/gradiente atrás do texto — só na parte de baixo da foto. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-5 h-[54%] overflow-hidden rounded-b-[22px] backdrop-blur-md mask-[linear-gradient(to_top,black_35%,transparent_100%)]">
            <div className="absolute -inset-2 bg-linear-to-t from-black/85 via-black/45 to-transparent" />
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
              className="w-full flex-1 justify-center rounded-full bg-foreground font-semibold text-default hover:bg-foreground/90 mt-1 p-1"
              onPress={() => navigate("/register")}
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
      <div className="rounded-[28px] bg-white p-1.5 shadow-lg ring-1 ring-black/5">
        <Card className="flex h-150 items-center justify-center rounded-[22px] border-none bg-primary-50">
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
export default function ClientServicesPage() {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
