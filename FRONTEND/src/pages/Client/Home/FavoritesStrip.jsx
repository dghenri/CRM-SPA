import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Heart } from "lucide-react";
import { fetchMyFavorites } from "../../../api/favorites";
import { formatPrice } from "./homeUtils";

// Faixa horizontal com os procedimentos favoritados. Não aparece se não há favoritos.
// id="home-favorites": o atalho "Favoritos" da Home rola até aqui.
export default function FavoritesStrip() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchMyFavorites()
      .then((list) => !cancelled && setFavorites(Array.isArray(list) ? list.filter((s) => s.available) : []))
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, []);

  if (favorites.length === 0) return null;

  return (
    <section id="home-favorites" className="scroll-mt-28">
      <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-bold">
        <Heart className="size-5 text-danger" fill="currentColor" />
        Seus favoritos
      </h2>

      <div
        // scroll-px-6: o "snap" alinha o card ao limite da área de rolagem e ignora o padding (px-6);
        // sem o scroll-padding o primeiro card colava na borda esquerda da tela
        className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {favorites.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => navigate(`/user/services/${service.id}`)}
            className="w-60 shrink-0 snap-start overflow-hidden rounded-2xl bg-overlay text-left drop-shadow-sm transition-transform active:scale-[0.98]"
          >
            <img src={service.image} alt={service.title} className="h-36 w-full object-cover" />
            <div className="p-3">
              <p className="line-clamp-1 text-sm font-semibold">{service.title}</p>
              <p className="mt-1 text-sm font-bold">{formatPrice(service.price)}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted">
                <Clock size={12} />
                {service.duration} min
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
