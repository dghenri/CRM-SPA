import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin, Navigation } from "lucide-react";

// Cartão com o mapa do Google (embed sem chave de API) + botões "Como chegar" e "Abrir no Google Maps".
// O mapa só é carregado quando o cartão está perto da tela: o iframe do Google é pesado e não deve
// atrasar a abertura da página.
//
//   <LocationCard name="Viva Bem SPA" address="Rua tal, 123 - Bairro, Cidade - UF" query="Rua tal, 123, Cidade" />
// `query` é o texto que o Google Maps pesquisa (pode ser o endereço, ou o nome do estabelecimento).
export default function LocationCard({ name, address, query = address }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const encoded = encodeURIComponent(query);
  const embedUrl = `https://www.google.com/maps?q=${encoded}&z=16&hl=pt-BR&output=embed`;
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  return (
    <div ref={ref} className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-xl ring-1 ring-black/5 dark:ring-white/10">
      <div className="relative h-80 w-full bg-default sm:h-96">
        {near ? (
          <iframe
            title={`Mapa com a localização de ${name}`}
            src={embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full animate-pulse items-center justify-center text-muted">
            <MapPin size={32} aria-hidden="true" />
          </div>
        )}

        {/* etiqueta sobre o mapa */}
        <div className="pointer-events-none absolute left-4 top-4 flex max-w-[78%] items-start gap-3 rounded-2xl bg-background/90 p-3 shadow-lg backdrop-blur">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <MapPin size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-sm font-semibold text-foreground">{name}</span>
            <span className="block text-xs text-muted">{address}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-4">
        <a
          href={routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition duration-300 hover:-translate-y-0.5 hover:opacity-90"
        >
          <Navigation size={16} aria-hidden="true" />
          Como chegar
        </a>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition duration-300 hover:-translate-y-0.5 hover:bg-default"
        >
          <ExternalLink size={16} aria-hidden="true" />
          Abrir no Google Maps
        </a>
      </div>
    </div>
  );
}
