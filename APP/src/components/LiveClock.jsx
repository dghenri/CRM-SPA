import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* -------------------------- fonte matricial 5x7 -------------------------- */
// Cada dígito é descrito como 7 linhas de 5 bits (1 = ponto aceso).
const DIGIT_PATTERNS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};
// Os dois pontos ocupam só 1 coluna.
const COLON_PATTERN = ['0', '0', '1', '0', '1', '0', '0'];

// Proporções relativas ao tamanho do ponto (dotSize), usadas tanto para
// desenhar quanto para calcular o tamanho ideal que cabe no container.
const GAP_RATIO = 0.28; // espaço entre pontos dentro de um caractere
const CHAR_GAP_RATIO = 0.55; // espaço entre caracteres vizinhos
const COLON_MARGIN_RATIO = 1.15; // espaço extra de cada lado dos ":" (separa h/min/seg)
const PADDING_PX = 12; // respiro fixo dentro do card

/* ------------------------------- um dígito ------------------------------- */
function DotChar({ char, dotSize, gap, onColor, offColor, glow }) {
  const isColon = char === ':';
  const pattern = isColon ? COLON_PATTERN : DIGIT_PATTERNS[char] ?? DIGIT_PATTERNS['0'];
  const cols = isColon ? 1 : 5;

  return (
    <div
      className="grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`,
        gridTemplateRows: `repeat(7, ${dotSize}px)`,
        gap: `${gap}px`,
      }}
    >
      {pattern.flatMap((row, r) =>
        (isColon ? [row] : row.split('')).map((bit, c) => {
          const lit = bit === '1';
          return (
            <span
              key={`${r}-${c}`}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: Math.max(1, dotSize * 0.28),
                backgroundColor: lit ? onColor : offColor,
                boxShadow: lit && glow ? `0 0 ${dotSize}px ${onColor}99` : 'none',
                transition: 'background-color 150ms ease, box-shadow 150ms ease',
              }}
            />
          );
        })
      )}
    </div>
  );
}

/* -------------------------------- relógio -------------------------------- */
/**
 * Relógio em estilo painel LED / matriz de pontos.
 * Ocupa 100% do container (w-full h-full) e recalcula o tamanho dos pontos
 * via ResizeObserver, então acompanha o card ao redimensionar a tela.
 *
 * Props:
 * - withSeconds: mostra os segundos (padrão: true)
 * - onColor: cor dos pontos acesos (padrão: '#ffffff')
 * - offColor: cor dos pontos apagados (padrão: 'rgba(255,255,255,0.08)')
 * - glow: aplica brilho nos pontos acesos (padrão: true)
 * - className: classes extras para o container
 */
export default function LiveClock({
  withSeconds = true,
  onColor = '#ffffff',
  offColor = 'rgba(255,255,255,0.08)',
  glow = true,
  className = '',
}) {
  const [now, setNow] = useState(() => new Date());
  const containerRef = useRef(null);
  const [dotSize, setDotSize] = useState(7);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const chars = (withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`).split('');
  const colonCount = chars.filter((c) => c === ':').length;
  const digitCount = chars.length - colonCount;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const digitWidthUnits = 5 + 4 * GAP_RATIO;
    const colonWidthUnits = 1;
    const totalWidthUnits =
      digitCount * digitWidthUnits +
      colonCount * colonWidthUnits +
      (chars.length - 1) * CHAR_GAP_RATIO +
      colonCount * 2 * COLON_MARGIN_RATIO;
    const totalHeightUnits = 7 + 6 * GAP_RATIO;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const availableW = Math.max(0, width - PADDING_PX * 2);
      const availableH = Math.max(0, height - PADDING_PX * 2);
      const next = Math.max(
        1,
        Math.min(availableW / totalWidthUnits, availableH / totalHeightUnits)
      );
      setDotSize(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [digitCount, colonCount, chars.length]);

  const gap = dotSize * GAP_RATIO;
  const charGap = dotSize * CHAR_GAP_RATIO;
  const colonMargin = dotSize * COLON_MARGIN_RATIO;

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black ${className}`}
      style={{ padding: PADDING_PX }}
    >
      <div className="flex items-center" style={{ gap: `${charGap}px` }}>
        {chars.map((char, i) => (
          <div
            key={i}
            style={
              char === ':'
                ? { marginLeft: colonMargin, marginRight: colonMargin }
                : undefined
            }
          >
            <DotChar
              char={char}
              dotSize={dotSize}
              gap={gap}
              onColor={onColor}
              offColor={offColor}
              glow={glow}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
