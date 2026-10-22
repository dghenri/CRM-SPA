// Borda curva entre duas faixas de cor (no lugar de degradês).
// A cor do preenchimento vem do `className` (use text-*: o SVG usa currentColor).
//
//   <SectionCurve position="top" className="text-neutral-950" glow />   -> arco que "sobe" na frente da seção acima
//   <SectionCurve position="bottom" className="text-neutral-950" glow /> -> arco que "desce" sobre a seção abaixo
//
// `edge` desenha só o fio de luz azul ao longo da curva (some se glow={false}).
export default function SectionCurve({ position = "top", className = "", glow = false, inside = false }) {
  const top = position === "top";
  // inside=true: a curva fica dentro do container (ex.: no rodapé do hero); senão, fora dele
  const placement = inside
    ? top ? "bottom-0" : "top-0"
    : top ? "bottom-full" : "top-full";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 ${placement} z-10 block h-10 w-full sm:h-16 lg:h-24 ${className}`}
      style={{ transform: top ? undefined : "scaleY(-1)" }}
    >
      <defs>
        <linearGradient id={`curve-glow-${position}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3b82f6" stopOpacity="0" />
          <stop offset="0.5" stopColor="#60a5fa" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 100 V46 Q720 -26 1440 46 V100 Z" fill="currentColor" />
      {glow && (
        <path
          d="M0 46 Q720 -26 1440 46"
          fill="none"
          stroke={`url(#curve-glow-${position})`}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
