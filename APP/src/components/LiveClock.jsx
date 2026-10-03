import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Tamanho de referência (px) só pra medir a largura do texto no canvas e
// escalar proporcionalmente - não é o tamanho final renderizado.
const REFERENCE_FONT_SIZE = 100;
// Razão aproximada entre a altura "visual" de dígitos tabulares e o
// font-size (algo entre x-height e cap-height), usada pra caber na altura
// do container sem precisar renderizar fora da tela só pra medir.
const CAP_HEIGHT_RATIO = 0.72;
// Quanto menor os segundos ficam em relação ao HH:MM, como em boa parte
// dos relógios digitais (o "miúdo" de segundos ao lado do horário grande).
const SECONDS_SCALE = 0.55;
const PADDING_PX = 16;

function measureTextWidth(text, fontSizePx, fontFamily) {
  if (!measureTextWidth.canvas) {
    measureTextWidth.canvas = document.createElement('canvas');
  }
  const ctx = measureTextWidth.canvas.getContext('2d');
  ctx.font = `600 ${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Relógio digital que usa as cores do tema (claro/escuro) da aplicação em
 * vez de uma paleta fixa - acompanha .dark/[data-theme="dark"] sozinho,
 * através das variáveis --live-clock-bg/border/fg/accent (ver global.css).
 *
 * Ocupa 100% do container (w-full h-full) e recalcula o tamanho da fonte
 * via ResizeObserver, então acompanha o card ao redimensionar a tela -
 * mesma ideia do relógio de pontos anterior, só que medindo texto em vez
 * de uma grade de dots.
 *
 * Props:
 * - withSeconds: mostra os segundos, menores e na cor de destaque
 *   (padrão: true)
 * - className: classes extras para o container
 */
export default function LiveClock({
  withSeconds = true,
  className = '',
}) {
  const [now, setNow] = useState(() => new Date());
  const containerRef = useRef(null);
  const [fontSize, setFontSize] = useState(32);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  // Medir sempre contra o PIOR CASO ("8" é o dígito mais largo), nunca
  // contra a hora atual: o <canvas> usado pra medir não entende
  // font-variant-numeric (tabular-nums), então "1" e "8" saem com larguras
  // diferentes ali mesmo renderizando do mesmo tamanho na tela - foi isso
  // que fazia o relógio "respirar"/mudar de tamanho a cada segundo.
  const worstCaseText = withSeconds ? '88:88:88' : '88:88';

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fontFamily = getComputedStyle(el).fontFamily || 'ui-monospace, monospace';

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const availableW = Math.max(0, width - PADDING_PX * 2);
      const availableH = Math.max(0, height - PADDING_PX * 2);

      const measuredWidth = measureTextWidth(worstCaseText, REFERENCE_FONT_SIZE, fontFamily) || 1;
      const widthScale = availableW / measuredWidth;
      const heightScale = availableH / (REFERENCE_FONT_SIZE * CAP_HEIGHT_RATIO);

      // conservador de propósito: a string medida assume segundos do
      // mesmo tamanho que HH:MM, mas eles renderizam menores (SECONDS_SCALE)
      // - então o resultado real sempre cabe, nunca estoura.
      const next = Math.max(8, REFERENCE_FONT_SIZE * Math.min(widthScale, heightScale));
      setFontSize(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // só remede quando o layout pode ter mudado de verdade (liga/desliga
    // segundos) - NUNCA a cada tick do relógio
  }, [worstCaseText]);

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-overlay ${className}`}
      style={{ padding: PADDING_PX }}
    >
      <div
        className="flex items-baseline font-mono font-semibold tabular-nums"
        style={{ gap: fontSize * 0.06 }}
      >
        <span className="text-live-clock-fg" style={{ fontSize }}>
          {hh}
        </span>
        <span className="text-live-clock-fg" style={{ fontSize }}>
          :
        </span>
        <span className="text-live-clock-fg" style={{ fontSize }}>
          {mm}
        </span>

        {withSeconds && (
          <>
            <span
              /* className="text-live-clock-accent" */
              style={{ fontSize: fontSize * SECONDS_SCALE }}
            >
              :
            </span>
            <span
              className="text-live-clock-accent"
              style={{ fontSize: fontSize * SECONDS_SCALE }}
            >
              {ss}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
