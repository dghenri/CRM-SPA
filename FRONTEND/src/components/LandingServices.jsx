import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Spinner } from "@heroui/react";
import { ArrowRight, Clock, CircleAlert, OctagonAlert } from "lucide-react";
import { fetchServices } from "../api/services";
import Reveal from "./Reveal";

// A inclinação 3D do card só liga em dispositivos com mouse e sem "reduzir movimento"
const canTilt = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;

function ClientServiceCard({ service }) {
  const navigate = useNavigate();
  const tiltRef = useRef(null);
  const imageRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  // imagem que já estava no cache do navegador não dispara o onLoad
  useEffect(() => {
    if (imageRef.current?.complete) setLoaded(true);
  }, []);

  function handlePointerMove(event) {
    if (!canTilt()) return;
    const element = tiltRef.current;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    element.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
    element.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
  }

  function handlePointerLeave() {
    const element = tiltRef.current;
    element.style.setProperty("--ry", "0deg");
    element.style.setProperty("--rx", "0deg");
  }

  return (
    <div className="group pb-2" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      {/* Bezel branco em volta de toda a foto/infos, como uma moldura */}
      <div
        ref={tiltRef}
        className="rounded-[28px] bg-background p-1.5 shadow-lg ring-1 ring-black/5 transition-[transform,scale,box-shadow] duration-300 ease-out group-hover:scale-[1.03] group-hover:shadow-2xl"
        style={{ transform: "perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))" }}
      >
        <Card className="relative h-150 overflow-hidden rounded-[22px] border-none">
          {/* enquanto a foto não chega, um bloco pulsando ocupa o lugar */}
          <div className={`absolute inset-0 animate-pulse bg-default transition-opacity duration-500 ${loaded ? "opacity-0" : "opacity-100"}`} />

          {/* Foto de fundo — ocupa o card inteiro como um background */}
          <img
            ref={imageRef}
            src={service.image}
            alt={service.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-700 ease-out ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />

          {service.category && (
            <span className="absolute left-4 top-4 z-10 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
              {service.category}
            </span>
          )}

          {/* Blur do rodapé: uma cópia BORRADA da própria foto, revelada só embaixo por uma máscara.
              Não usa backdrop-filter: ele + máscara + scale no hover renderiza com falhas (faixa dura, cantos). */}
          <img
            src={service.image}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover blur-xl [mask-image:linear-gradient(to_top,black_18%,transparent_36%)]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-5 h-[40%] bg-linear-to-t from-black/85 via-black/45 to-transparent" />

          {/* Conteúdo textual */}
          <Card.Content className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-5 text-white">
            <div>
              <h3 className="font-serif text-2xl font-bold leading-tight">
                {service.title}
              </h3>
            </div>

            {/* Linha de informações sobre o procedimento */}
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-white/85">
                <Clock size={15} />
                {service.duration} min
              </span>
            </div>

            {/* Botão dentro do card */}
            <Button
              variant="light"
              className="mt-1 w-full justify-center gap-2 rounded-full bg-white p-1 font-semibold text-black shadow-lg hover:bg-white/90"
              onPress={() => navigate("/register")}
            >
              Agendar
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
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
      <div className="rounded-[28px] bg-background p-1.5 shadow-lg ring-1 ring-border/5 transition-shadow duration-300 group-hover:shadow-2xl">
        <Card className="flex h-150 items-center justify-center rounded-[22px] border-none">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="font-serif text-2xl font-bold text-foreground">
              E mais...
            </p>
            <p className="text-sm text-muted">
              +{count} {count === 1 ? "procedimento" : "procedimentos"} disponíveis
            </p>
            <p className="mt-3 text-xs text-muted">Crie sua conta para ver todos</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Esqueleto com o mesmo formato dos cards, enquanto a lista chega da API
function ServiceCardSkeleton() {
  return (
    <div className="pb-2" aria-hidden="true">
      <div className="rounded-[28px] bg-background p-1.5 shadow-lg ring-1 ring-black/5">
        <div className="h-150 animate-pulse rounded-[22px] bg-default" />
      </div>
    </div>
  );
}

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
        if (!cancelled) {
          setLoadError(err.message || "Erro ao carregar procedimentos.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleServices = services.filter((service) => service.available);

  const MAX_VISIBLE = 5;
  const displayedServices = visibleServices.slice(0, MAX_VISIBLE);
  const hiddenCount = visibleServices.length - displayedServices.length;

  return (
    <section className="w-full p-5">
      <div className="mb-8 text-center">
        <Reveal as="p" className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent">
          Nossos
        </Reveal>
        <Reveal as="h2" delay={100} className="font-serif text-4xl font-bold text-foreground">
          Procedimentos
        </Reveal>
        <Reveal as="p" delay={200} className="mx-auto mt-2 max-w-xl text-muted">
          Escolha o cuidado ideal para você e agende em poucos cliques.
        </Reveal>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-center gap-2 font-semibold">
            <Spinner color="current" />
            <p className="text-center text-muted">Carregando procedimentos...</p>
          </div>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <ServiceCardSkeleton key={item} />
            ))}
          </div>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center gap-2 text-danger">
          <OctagonAlert />
          <p className="text-center font-semibold">
            Não foi possível carregar os procedimentos. Tente novamente em instantes.
          </p>
        </div>
      ) : visibleServices.length > 0 ? (
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {displayedServices.map((service, index) => (
            <Reveal key={service.id} delay={(index % 3) * 130} distance={44}>
              <ClientServiceCard service={service} />
            </Reveal>
          ))}
          {hiddenCount > 0 && (
            <Reveal delay={(displayedServices.length % 3) * 130} distance={44}>
              <MoreServicesTile count={hiddenCount} />
            </Reveal>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-warning">
          <CircleAlert />
          <p className="text-center">Nenhum serviço disponível no momento.</p>
        </div>
      )}
    </section>
  );
}
