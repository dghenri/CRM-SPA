import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@heroui/react";
import Grainient from "../../../components/Grainient";
import { useBanners } from "../../../hooks/useBanners";

// Card exibido quando não há nenhum banner ativo (perfil completo, cupom usado
// e nada criado pela equipe) - assim a área nunca fica vazia.
const FALLBACK_CARD = {
  id: "fallback",
  title: "Bem-vindo ao Riviera",
  description: "Escolha o procedimento, a data e o horário que melhor combinam com você.",
  buttonLabel: "Agendar",
  path: "/user/services",
};

/* ------------------------------ carrossel -------------------------------- */
const AUTOPLAY_MS = 5000; // tempo de cada card
const DRAG_START_PX = 6; // movimento mínimo para considerar "arrastar" (abaixo disso é toque/clique)
const SWIPE_RATIO = 0.2; // arrastou 20% da largura = troca de card
const FLICK_SPEED = 0.4; // px/ms: um "peteleco" rápido também troca
const EDGE_RESISTANCE = 0.3; // arrastar além do primeiro/último card fica "pesado"

/**
 * Carrossel de cards: o usuário arrasta para os lados (mouse ou toque) para
 * trocar, ou toca nos pontinhos. Avança sozinho a cada AUTOPLAY_MS, e pausa
 * enquanto o usuário arrasta, passa o mouse ou foca no card (não há botão de
 * pausa na tela). Respeita "reduzir movimento" do sistema (sem autoplay).
 */
function useCarousel(count) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const viewportRef = useRef(null);
  const drag = useRef({ active: false, pointerId: null, startX: 0, lastX: 0, lastT: 0, velocity: 0 });

  const goTo = useCallback((i) => setIndex(Math.min(count - 1, Math.max(0, i))), [count]);

  // autoplay: reinicia a contagem a cada troca (inclusive as feitas pelo usuário)
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || dragging || hovered || count < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, dragging, hovered, count]);

  // a quantidade de cards muda (perfil completado, banner desligado...): nunca fica num índice que não existe mais
  useEffect(() => {
    setIndex((i) => (i >= count ? Math.max(0, count - 1) : i));
  }, [count]);

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { active: false, pointerId: e.pointerId, startX: e.clientX, lastX: e.clientX, lastT: e.timeStamp, velocity: 0, armed: true };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d.armed || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;

    if (!d.active) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      // só "captura" o ponteiro depois que virou arrasto: assim um simples
      // toque/clique nos botões do card continua funcionando normalmente
      d.active = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }

    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;

    const atEdge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0);
    setDragX(atEdge ? dx * EDGE_RESISTANCE : dx);
  };

  const endDrag = (e) => {
    const d = drag.current;
    if (!d.armed || e.pointerId !== d.pointerId) return;
    d.armed = false;
    if (!d.active) return;
    d.active = false;

    const width = viewportRef.current?.offsetWidth || 1;
    const dx = e.clientX - d.startX;
    const flick = Math.abs(d.velocity) > FLICK_SPEED && Math.abs(dx) > 30;
    if (Math.abs(dx) > width * SWIPE_RATIO || flick) {
      goTo(index + (dx < 0 ? 1 : -1));
    }
    setDragging(false);
    setDragX(0);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") goTo(index + 1);
    if (e.key === "ArrowLeft") goTo(index - 1);
  };

  return {
    index,
    goTo,
    dragX,
    dragging,
    viewportRef,
    viewportProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setHovered(true),
      onBlur: () => setHovered(false),
      onKeyDown,
    },
  };
}

export default function UserDiscovery() {
  const { banners, isLoading } = useBanners();
  const cards = banners.length > 0 || isLoading ? banners : [FALLBACK_CARD];
  const { index, goTo, dragX, dragging, viewportRef, viewportProps } = useCarousel(cards.length);
  const navigate = useNavigate();

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-roledescription="carrossel"
      aria-label="Novidades"
      tabIndex={0}
      {...viewportProps}
      className="relative mb-2 h-55 touch-pan-y cursor-grab select-none overflow-hidden rounded-2xl bg-black outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {/* Background */}
      <div className="absolute inset-0">
        <Grainient
          color1="#000000"
          color2="#000000"
          color3="#4881fe"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1.75}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={30}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.4}
          grainScale={7.2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Faixa de cards: desliza para os lados */}
      <div
        className="absolute inset-0 flex"
        style={{
          transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
          transition: dragging ? "none" : "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {cards.map((card, i) => {
          const isCurrent = i === index;
          return (
            <div
              key={card.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${cards.length}`}
              aria-hidden={!isCurrent}
              className="relative h-full w-full shrink-0 p-4"
            >
              {/* Conteúdo */}
              <div className="relative z-10 h-full space-y-2">
                <h2 className="text-xl font-bold text-white">{card.title}</h2>

                <p className="pr-30 text-sm text-white">{card.description}</p>

                {card.buttonLabel && card.path && (
                  <Button
                    variant="tertiary"
                    className="absolute bottom-0 left-0"
                    tabIndex={isCurrent ? 0 : -1}
                    onPress={() => navigate(card.path)}
                  >
                    {card.buttonLabel}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Steps (só com mais de um card) */}
      {cards.length > 1 && <div
        className="absolute bottom-0 left-1/2 z-20 flex h-9 -translate-x-1/2 items-center"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {cards.map((card, i) => (
          <button
            key={card.id}
            type="button"
            aria-label={`Ir para o card ${i + 1}`}
            aria-current={i === index}
            onClick={() => goTo(i)}
            // área de toque maior que o dot em si
            className="group flex h-6 cursor-pointer items-center px-1"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/50 group-hover:bg-white/80"
              }`}
            />
          </button>
        ))}
      </div>}
    </div>
  );
}
