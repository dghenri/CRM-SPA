import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Toast } from '@heroui/react';

// Distance (px) to swipe up before the toast is dismissed
const DISMISS_THRESHOLD = 60;
// Or a fast-enough flick (px/ms) dismisses even under the distance threshold
const VELOCITY_THRESHOLD = 0.5;

function useSwipeToDismissToasts() {
  useEffect(() => {
    // Let the browser know these elements handle vertical gestures
    // themselves, so touch scrolling doesn't steal the gesture on mobile.
    const style = document.createElement("style");
    style.textContent = `.toast { touch-action: pan-x; }`;
    document.head.appendChild(style);

    const dragState = new Map(); // toastEl -> { startY, startTime, dragging }
    const getToastEl = (target) => target?.closest?.(".toast");

    const onPointerDown = (e) => {
      const toastEl = getToastEl(e.target);
      if (!toastEl) return;
      // Don't hijack taps on the close/action buttons
      if (e.target.closest(".toast__close, .toast__action")) return;

      dragState.set(toastEl, { startY: e.clientY, startTime: Date.now(), dragging: true });
      toastEl.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      const toastEl = getToastEl(e.target);
      const state = toastEl && dragState.get(toastEl);
      if (!state?.dragging) return;

      const delta = Math.min(0, e.clientY - state.startY);
      const progress = Math.min(Math.abs(delta) / DISMISS_THRESHOLD, 1);

      toastEl.style.transition = "none";
      toastEl.style.translate = `0 ${delta}px`;
      toastEl.style.opacity = String(1 - progress * 0.7);
    };

    const onPointerUp = (e) => {
      const toastEl = getToastEl(e.target);
      const state = toastEl && dragState.get(toastEl);
      if (!state?.dragging) return;
      state.dragging = false;

      const delta = e.clientY - state.startY;
      const elapsed = Date.now() - state.startTime;
      const velocity = Math.abs(delta) / Math.max(elapsed, 1);
      const shouldDismiss =
        delta < -DISMISS_THRESHOLD || (delta < 0 && velocity > VELOCITY_THRESHOLD);

      if (shouldDismiss) {
        // Trigger HeroUI's own close flow (and its own exit animation)
        const closeBtn = toastEl.querySelector(".toast__close button, .toast__close");
        closeBtn?.click();
      } else {
        toastEl.style.transition = "translate 0.2s ease, opacity 0.2s ease";
        toastEl.style.translate = "";
        toastEl.style.opacity = "";
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);

    return () => {
      style.remove();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);
}

export default function App() {
  useSwipeToDismissToasts();

  return (
    <div>
      {/* Default rendering, untouched: this keeps HeroUI's built-in
          enter/exit animation and 3-toast stacking exactly as shipped. */}
      <Toast.Provider className="font-semibold mt-4 md:mt-0" placement="top end" />
      <Outlet />
    </div>
  );
}
