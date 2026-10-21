import { useEffect } from "react";

// Escreve duas variáveis CSS no elemento (sem re-renderizar o React a cada rolagem):
//   --p     0 → 1 durante a primeira tela (usada no parallax do hero)
//   --page  0 → 1 ao longo da página inteira (barra de progresso)
// Usa requestAnimationFrame e listener passivo, então a rolagem continua fluida.
export default function useScrollVars(ref) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const viewport = window.innerHeight || 1;
      const scrollable = Math.max(1, document.documentElement.scrollHeight - viewport);
      element.style.setProperty("--p", reduced ? "0" : Math.min(1, y / viewport).toFixed(4));
      element.style.setProperty("--page", Math.min(1, y / scrollable).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
