// Mockup de iPhone 15 Pro Max feito só com CSS (moldura de titânio, ilha dinâmica, botões laterais,
// barra de status e indicador de início). Todas as medidas usam `cqw` (1% da largura do aparelho),
// então ele escala sozinho: basta dar uma largura (className="w-64").
//
//   <PhoneMockup src="/Screens/home.webp" alt="Tela inicial do aplicativo" className="w-64" />
//   <PhoneMockup className="w-64">{...várias <img> empilhadas...}</PhoneMockup>   (conteúdo próprio)
//
// A imagem deve ter a proporção da tela do iPhone (1290x2796). Proporção externa do aparelho: 0,48.

const TITANIUM = "linear-gradient(135deg, #7a7873 0%, #2d2c2a 20%, #161618 50%, #3a3937 80%, #8f8c86 100%)";
const BUTTON = "linear-gradient(90deg, #5d5b57, #2a2927)";

const SIDE_BUTTONS = [
  // [lado, topo %, altura %]
  ["left", 17, 3],
  ["left", 24, 6],
  ["left", 32, 6],
  ["right", 29, 10],
];

function StatusIcons() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "1.3cqw", height: "3.4cqw" }} aria-hidden="true">
      <svg viewBox="0 0 18 12" style={{ height: "100%" }} fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      <svg viewBox="0 0 17 12" style={{ height: "100%" }} fill="currentColor">
        <path d="M8.5 2.4c2.3 0 4.4.9 6 2.4l1.1-1.2A11.2 11.2 0 0 0 8.5.7 11.2 11.2 0 0 0 1.4 3.6l1.1 1.2a8.6 8.6 0 0 1 6-2.4Zm0 3.7c1.3 0 2.5.5 3.4 1.3l1.1-1.2a7 7 0 0 0-9 0l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3Zm0 3.6c.6 0 1.1.2 1.5.6L8.5 12 7 10.3c.4-.4.9-.6 1.5-.6Z" />
      </svg>
      <svg viewBox="0 0 27 12" style={{ height: "100%" }} fill="currentColor">
        <rect x="0.5" y="0.5" width="22.5" height="11" rx="3.2" fill="none" stroke="currentColor" opacity="0.4" />
        <rect x="2" y="2" width="19.5" height="8" rx="2" />
        <rect x="24.2" y="4" width="2" height="4" rx="1" opacity="0.45" />
      </svg>
    </span>
  );
}

export default function PhoneMockup({ src, alt = "", children, className = "", eager = false }) {
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: "480 / 1000", containerType: "inline-size" }}>
      {/* botões laterais */}
      {SIDE_BUTTONS.map(([side, top, height]) => (
        <span
          key={`${side}-${top}`}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: `${top}%`,
            height: `${height}%`,
            width: "1cqw",
            [side]: "-0.8cqw",
            borderRadius: side === "left" ? "0.6cqw 0 0 0.6cqw" : "0 0.6cqw 0.6cqw 0",
            background: BUTTON,
          }}
        />
      ))}

      {/* moldura de titânio */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "14.5cqw",
          background: TITANIUM,
          boxShadow:
            "inset 0 0 0 0.35cqw rgba(255,255,255,0.16), inset 0 0 1.6cqw rgba(0,0,0,0.65), 0 7cqw 12cqw -4cqw rgba(0,0,0,0.55)",
        }}
      />
      {/* borda preta ao redor da tela */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "0.9cqw", borderRadius: "13.6cqw", background: "#050506" }} />

      {/* tela */}
      <div style={{ position: "absolute", inset: "3.4cqw", borderRadius: "11cqw", overflow: "hidden", background: "#fff" }}>
        {children ?? (
          <img
            src={src}
            alt={alt}
            width={760}
            height={1647}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            style={{ height: "100%", width: "100%", objectFit: "cover", userSelect: "none" }}
          />
        )}

        {/* barra de status */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "6.6cqw",
            left: 0,
            right: 0,
            transform: "translateY(-50%)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 8.5cqw",
            color: "#111",
            fontSize: "3.7cqw",
            fontWeight: 600,
            fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
            letterSpacing: "-0.01em",
          }}
        >
          <span>9:41</span>
          <StatusIcons />
        </div>

        {/* ilha dinâmica */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", top: "2.6cqw", left: "50%", width: "27cqw", height: "8cqw", transform: "translateX(-50%)", borderRadius: "999px", background: "#000" }}
        />
        {/* indicador de início */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", bottom: "1.8cqw", left: "50%", width: "34cqw", height: "1.3cqw", transform: "translateX(-50%)", borderRadius: "999px", background: "rgba(0,0,0,0.88)" }}
        />
        {/* reflexo no vidro */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 32%)" }}
        />
      </div>
    </div>
  );
}
