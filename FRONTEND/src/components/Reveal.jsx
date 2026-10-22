import { createContext, useContext, useEffect, useRef, useState } from "react";

// Animação de "aparecer ao entrar na tela" (sem biblioteca: IntersectionObserver + transição CSS).
//
//   <Reveal>conteúdo</Reveal>                        sobe e aparece
//   <Reveal direction="left" delay={150}>...</Reveal> vem da esquerda, com atraso (para fazer escada)
//   <Reveal as="h2" className="...">título</Reveal>   troca a tag; as classes ficam no próprio elemento
//
// Directions: up | down | left | right | zoom | line (cresce da esquerda p/ direita) | fade
//
// <RevealProvider ready={false}> segura todas as animações até `ready` virar true
// (a landing usa isso para esperar o carregamento inicial terminar).
// Quem tem "reduzir movimento" ativado no sistema vê o conteúdo direto, sem animação.

const RevealContext = createContext(true);
export const RevealProvider = ({ ready, children }) => <RevealContext.Provider value={ready}>{children}</RevealContext.Provider>;
// Para componentes que animam por conta própria (ex: Navbar) saberem se já podem começar
export const useRevealReady = () => useContext(RevealContext);

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false));
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const HIDDEN = {
  up: (d) => `translate3d(0, ${d}px, 0)`,
  down: (d) => `translate3d(0, ${-d}px, 0)`,
  left: (d) => `translate3d(${-d}px, 0, 0)`,
  right: (d) => `translate3d(${d}px, 0, 0)`,
  zoom: () => "scale(0.92)",
  line: () => "scaleX(0)",
  fade: () => "none",
};

export default function Reveal({
  as: Tag = "div",
  direction = "up",
  delay = 0,
  duration = 800,
  distance = 32,
  once = true,
  className,
  style,
  children,
  ...rest
}) {
  const ref = useRef(null);
  const ready = useContext(RevealContext);
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const element = ref.current;
    if (!element) return;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // threshold 0 + margem: funciona também para blocos mais altos que a tela
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, reduced, once]);

  const hidden = !visible && !reduced;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: hidden ? 0 : 1,
        transform: hidden ? (HIDDEN[direction] ?? HIDDEN.up)(distance) : "none",
        transformOrigin: direction === "line" ? "left center" : undefined,
        transition: reduced ? "none" : `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        // will-change cria um "bloco de contenção" para elementos fixos (modais): só enquanto anima
        willChange: hidden ? "opacity, transform" : "auto",
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
