import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Toast } from "@heroui/react";

/* ---------------------------------------------------------------------------
 * Deslizar para dispensar toasts (HeroUI v3)
 *
 * Como funciona:
 * - O HeroUI posiciona o toast com `transform: translateY(var(--dir) * (var(--toast-y) + var(--toast-enter)))`.
 *   Em vez de sobrescrever `translate`/`transform` (que brigava com o empilhamento e deixava o toast
 *   preso e apagado), arrastamos mexendo só na variável `--toast-enter`. O resto (escala, posição na
 *   pilha, transição) continua sendo do HeroUI.
 * - Ponto de corte = METADE da altura do toast.
 *     · Antes da metade: o toast acompanha o dedo, 100% opaco.
 *     · A partir da metade: começa a esmaecer conforme sobe.
 *     · Soltou depois da metade (ou deu um "flick" rápido): continua saindo da tela com ease-in
 *       (acelera, como as notificações do sistema), esmaecendo até 0 e termina FORA da tela.
 *     · Soltou antes da metade: volta para o lugar com ease-out.
 * - Fecha pelo botão `[data-slot="toast-close"]` (o fechamento oficial do HeroUI), então o toast
 *   seguinte sobe para o lugar enquanto este termina de sair.
 * ------------------------------------------------------------------------- */

const DISMISS_RATIO = 0.5; // fração da altura do toast que precisa ser percorrida
const FLICK_VELOCITY = 0.5; // px/ms - um gesto rápido dispensa mesmo antes da metade
const START_SLOP = 4; // px de movimento vertical antes de considerar que é um arrasto
const EXIT_MS = 260; // < 300ms (tempo que o HeroUI mantém o toast montado ao fechar)
const EXIT_EASE = "cubic-bezier(0.4, 0, 1, 1)"; // ease-in "acelerando"
const RETURN_MS = 250;
const RETURN_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"; // ease-out

const INTERACTIVE = '[data-slot="toast-close"], [data-slot="toast-action-button"], button, a, input, textarea';

function useSwipeToDismissToasts() {
  useEffect(() => {
    // O gesto vertical é nosso: sem isso o navegador "rouba" o toque (pointercancel) e o toast
    // só sobe às vezes.
    const style = document.createElement("style");
    style.textContent = `[data-slot="toast"] { touch-action: none; user-select: none; -webkit-user-select: none; }`;
    document.head.appendChild(style);

    let drag = null; // { el, id, startY, startT, dir, half, dragging, lastY, lastT }
    let swallowClick = false;
    let cleanupTimer = 0;

    const setEnter = (el, px) => el.style.setProperty("--toast-enter", `${px}px`);

    const resetInline = (el) => {
      el.style.removeProperty("--toast-enter");
      el.style.removeProperty("transition");
      el.style.removeProperty("opacity");
    };

    const onPointerDown = (e) => {
      if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      const el = e.target.closest?.('[data-slot="toast"]');
      if (!el || el.dataset.exiting === "true" || el.dataset.hidden === "true") return;
      // Só o toast da frente (ou qualquer um quando a pilha está expandida)
      if (el.dataset.frontmost !== "true" && el.dataset.expanded !== "true") return;
      if (e.target.closest(INTERACTIVE)) return; // não sequestra cliques nos botões

      clearTimeout(cleanupTimer);
      resetInline(el);
      const dir = parseFloat(getComputedStyle(el).getPropertyValue("--dir")) || 1; // top = 1, bottom = -1
      drag = {
        el,
        id: e.pointerId,
        startY: e.clientY,
        startT: performance.now(),
        lastY: e.clientY,
        lastT: performance.now(),
        dir,
        half: (el.offsetHeight || 60) * DISMISS_RATIO,
        dragging: false,
      };
    };

    // quanto o toast já andou na direção de sair (px, >= 0)
    const pullOf = (d, y) => Math.max(0, -d.dir * (y - d.startY));

    const onPointerMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      const dy = e.clientY - d.startY;

      if (!d.dragging) {
        if (Math.abs(dy) < START_SLOP) return;
        d.dragging = true;
        try { d.el.setPointerCapture(d.id); } catch { /* ok */ }
        d.el.style.transition = "none"; // acompanha o dedo sem atraso
      }

      const pull = pullOf(d, e.clientY);
      const wrong = Math.max(0, d.dir * dy); // arrastou para o lado errado: resistência
      setEnter(d.el, pull > 0 ? -pull : wrong * 0.12);

      // até a metade: 100% opaco. Depois da metade: esmaece progressivamente.
      const fade = Math.min(Math.max((pull - d.half) / d.half, 0), 1);
      d.el.style.opacity = String(1 - fade * 0.6);

      d.lastY = e.clientY;
      d.lastT = performance.now();
    };

    const finish = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.dragging) return; // foi só um toque: deixa o clique normal acontecer

      swallowClick = true; // o "click" que o navegador dispara depois do arrasto não deve ativar nada
      setTimeout(() => (swallowClick = false), 0);
      try { d.el.releasePointerCapture(d.id); } catch { /* ok */ }

      const pull = pullOf(d, e.clientY);
      const elapsed = Math.max(performance.now() - d.startT, 1);
      const velocity = pull / elapsed;
      const shouldDismiss = !cancelled && (pull >= d.half || (pull > 12 && velocity > FLICK_VELOCITY));

      if (shouldDismiss) {
        // Continua a partir de onde está até sair TOTALMENTE da tela, acelerando (ease-in) e esmaecendo.
        const rect = d.el.getBoundingClientRect();
        const toEdge = d.dir === 1 ? rect.bottom : window.innerHeight - rect.top; // distância até sumir
        setEnter(d.el, -(pull + toEdge + 8));
        d.el.style.transition = `transform ${EXIT_MS}ms ${EXIT_EASE}, opacity ${EXIT_MS}ms ease-in`;
        d.el.style.opacity = "0";
        // fecha pelo caminho oficial: os outros toasts já reacomodam enquanto este termina de sair
        swallowClick = false; // deixa passar o nosso próprio clique...
        d.el.querySelector('[data-slot="toast-close"]')?.click();
        swallowClick = true; // ...e volta a engolir o clique que o navegador dispara após o arrasto
        setTimeout(() => (swallowClick = false), 0);
      } else {
        // volta para o lugar
        d.el.style.transition = `transform ${RETURN_MS}ms ${RETURN_EASE}, opacity ${RETURN_MS}ms ease-out`;
        setEnter(d.el, 0);
        d.el.style.opacity = "1";
        cleanupTimer = setTimeout(() => resetInline(d.el), RETURN_MS + 40);
      }
    };

    const onPointerUp = (e) => finish(e, false);
    const onPointerCancel = (e) => finish(e, true);
    const onClickCapture = (e) => {
      if (!swallowClick) return;
      e.stopPropagation();
      e.preventDefault();
      swallowClick = false;
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("click", onClickCapture, true);

    return () => {
      clearTimeout(cleanupTimer);
      style.remove();
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);
}

export default function App() {
  useSwipeToDismissToasts();

  return (
    <div>
      {/* Renderização padrão: mantém a animação de entrada/saída e o empilhamento (3 toasts) do HeroUI. */}
      <Toast.Provider className="font-semibold mt-4 md:mt-0" placement="top end" />
      <Outlet />
    </div>
  );
}
