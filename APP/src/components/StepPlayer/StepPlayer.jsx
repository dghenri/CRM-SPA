import { useEffect, useRef, useState } from "react";

/* ══ Step player ══════════════════════════════════════════
   A row of dots and a play button. The dot for the current
   step is stretched into a bar that fills while the step runs;
   when it is full the bar eases over to the next dot, and a
   small wave runs through the dots it crossed.

   Portado de TSX pra JSX (bencho.dev/?c=step-player) - só foram
   removidas anotações de tipo, interfaces e "as const"; a lógica
   e a matemática da animação são exatamente as mesmas. Também
   ganhou suporte a step controlado de fora (currentStep /
   onStepChange) e autoPlay, pra dar pra usar como o "motor" de
   um carrossel de banners em vez de só um indicador de progresso
   isolado - é assim que o UserDiscovery usa ele.

   ── EVERY DOT IS A PILL WITH TWO EDGES ──────────────────
   There is no separate "active bar" travelling over the dots.
   Each dot is a pill with a left and a right edge, and the
   current step is simply the dot whose slot is wide. Changing
   step changes two slot widths and every edge eases to where
   its slot now is — which is what moves the bar, shrinks the
   old one and slides the dots in between.

   ── THE WAKE ────────────────────────────────────────────
   Chosen on the canvas from six ways of changing step, and
   then from seven kinds of ripple. The dots the bar passed
   over stand up and settle one after another, in the order it
   crossed them, and the bar it landed on answers last — a
   boat's wake rather than a stone dropped in a pond.

   Wake is also the knob, and its two ends were two of the
   seven: at 100 the whole wake, at 0 only the dot beside the
   landing moves, and the landing bar gives a small squash
   instead of a lift. Between them the wake reaches back over
   fewer dots and the landing's lift turns over into the
   squash. */

/* ── inlined from lab/spring ──────────────────────── */
/* ── one spring, for everything that settles ───────────────
   Frames, not milliseconds. `dt` is expressed in sixtieths of
   a second and the damping is RAISED to it rather than
   multiplied by it, so a dropped frame decays the same amount
   of energy as the two frames it replaced. */
const stillness = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ── inlined from lab/Sound ──────────────────────── */
const QUART = (t) => 1 - (1 - t) ** 4;
/* in AND out, for the one thing here that is a round trip
   between two shapes rather than an arrival at one */
const SWING = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function useTween(to, ms, instant = false, ease = QUART) {
  const [at, setAt] = useState(to);
  const cur = useRef(to);
  const raf = useRef(0);

  useEffect(() => {
    if (instant) {
      cur.current = to;
      setAt(to);
      return;
    }
    const from = cur.current;
    if (from === to) return;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      cur.current = from + (to - from) * ease(t);
      setAt(cur.current);
      raf.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [to, ms, instant, ease]);

  return at;
}

/* ── the play mark is DRAWN, not swapped ───────────────────
   Both marks are the SAME two quadrilaterals, and the
   difference between them is where eight points are. The
   pause is a pair of bars; the play is that pair with the
   inner edges pulled to the middle and collapsed to a point. */
const PAUSE_L = [6, 4, 10, 4, 10, 20, 6, 20];
const PLAY_L = [6.5, 4, 13.25, 8, 13.25, 16, 6.5, 20];
const PAUSE_R = [14, 4, 18, 4, 18, 20, 14, 20];
const PLAY_R = [13.25, 8, 20, 12, 20, 12, 13.25, 16];

const quad = (a, b, t) => {
  let d = "";
  for (let i = 0; i < 8; i += 2)
    d += `${i ? "L" : "M"}${mix(a[i], b[i], t).toFixed(2)} ${mix(
      a[i + 1],
      b[i + 1],
      t,
    ).toFixed(2)}`;
  return `${d}Z`;
};

function Mark({ playing, size, still }) {
  /* 0 is the pause, 1 is the play. */
  const t = useTween(playing ? 0 : 1, 300, still, SWING);

  const goo = Math.sin(clamp(t, 0, 1) * Math.PI);
  const pull = 1.6 * goo;
  const tip = (playing ? -9 : 9) * goo;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{
        transformOrigin: "50% 50%",
        transform: `rotate(${tip}deg) scale(${1 - 0.13 * goo}, ${1 + 0.11 * goo})`,
      }}
    >
      <path d={quad(PAUSE_L, PLAY_L, t)} transform={`translate(${pull} 0)`} />
      <path d={quad(PAUSE_R, PLAY_R, t)} transform={`translate(${-pull} 0)`} />
    </svg>
  );
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
/* ── OUT, NOT IN-OUT ─────────────────────────────────────
   The fill arrives at a steady speed; an ease-in-out leaves
   from a standstill, which made the row look like it froze at
   the moment it should be handing over. */
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

/* a dot, the bar it becomes, and the air between them. */
const DOT = 8;
const BAR = 36;
const GAP = 8;
/* the slab's inset round the row. */
const PAD = 14;
const H = DOT + PAD * 2;

/* the slide from one step to the next, ms */
const MOVE = 520;
/* the wave: when it starts after the move does, and how long
   one dot takes to stand up and settle. */
const LEAD = 60;
const RISE = 300;

export const MIN_STEPS = 3;
export const MAX_STEPS = 8;

/* where each dot's two edges belong, for a given current step */
const layout = (n, at) => {
  const out = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const w = i === at ? BAR : DOT;
    out.push([x, x + w]);
    x += w + GAP;
  }
  return out;
};

/* ── the wake, from the knob ─────────────────────────────
   `amp` is how far a dot stands up (a scale on its height),
   `reach` how many crossed dots back from the landing still
   answer, `self` the landing bar's share — positive lifts,
   negative squashes. */
const wakeOf = (w) => ({
  amp: mix(0.26, 0.34, w),
  reach: 1 + Math.round(w * 7),
  self: mix(-0.7, 0.3, w),
  stagger: mix(70, 55, w),
});

/* a spring for the rare edge with no timed move to follow —
   a knob changing the layout while nothing is animating */
const tune = (k, zeta) => ({ k, d: 1 - 2 * zeta * Math.sqrt(k) });
const SETTLE = tune(0.16, 1);

export function StepPlayer({
  /* how many steps, MIN_STEPS..MAX_STEPS */
  steps = 5,
  /* seconds a step takes to fill */
  pace = 3,
  /* how far back the ripple runs, 0..100 */
  wake = 100,
  /* step controlado de fora (opcional) - quando muda, o player
     anima até ele, igual a um clique numa das bolinhas */
  currentStep,
  /* chamado toda vez que o step muda (clique, auto-avanço ou
     sincronização pelo currentStep) - é por aqui que um
     carrossel por fora sabe qual slide mostrar */
  onStepChange,
  /* começa already tocando, sem precisar clicar no play */
  autoPlay = false,
} = {}) {
  const n = clamp(Math.round(steps), MIN_STEPS, MAX_STEPS);
  const still = stillness();
  const wk = wakeOf(clamp(wake, 0, 100) / 100);

  const [at, setAt] = useState(() => clamp(currentStep ?? 0, 0, n - 1));
  const [playing, setPlaying] = useState(autoPlay);
  /* bumped each frame something moves, and nothing else reads it */
  const [, setTick] = useState(0);

  const prog = useRef(0);
  const dots = useRef([]);
  const raf = useRef(0);
  const live = useRef({ at, playing, n, pace, wk });
  live.current = { at, playing, n, pace, wk };
  /* the wave running through the row, and where it came from */
  const wave = useRef(null);

  /* the dots follow the count; new ones start where they belong */
  if (dots.current.length !== n) {
    const slots = layout(n, Math.min(at, n - 1));
    dots.current = slots.map(([l, r], i) => ({
      l: { x: l, v: 0 },
      r: { x: r, v: 0 },
      ink: i < at ? 1 : 0,
    }));
  }
  if (at > n - 1) {
    /* a knob took the step we were on away */
    queueMicrotask(() => { setAt(n - 1); prog.current = 0; });
  }

  /* ── the one loop ────────────────────────────────────────
     Runs while anything is moving or the step is filling, and
     stops itself when neither is true, so a paused player on
     the wall costs nothing. */
  const run = () => {
    if (raf.current) return;
    let prev = 0;
    const tick = (t) => {
      const dt = prev ? clamp((t - prev) / 16.67, 0, 2.5) : 1;
      prev = t;
      const { at: cur, playing: on, n: count, pace: secs, wk: w } = live.current;
      const slots = layout(count, cur);
      let busy = false;

      /* the fill, and what happens when it is full */
      if (on) {
        prog.current += (dt * 16.67) / (Math.max(0.5, secs) * 1000);
        busy = true;
        if (prog.current >= 1) {
          if (cur < count - 1) {
            prog.current = 0;
            go(cur + 1, false);
          } else {
            prog.current = 1;
            setPlaying(false);
          }
        }
      }

      dots.current.forEach((d, i) => {
        const [tl, tr] = slots[i] ?? [0, 0];
        for (const [e, target] of [[d.l, tl], [d.r, tr]]) {
          if (still) { e.x = target; e.v = 0; e.tw = undefined; continue; }
          if (e.tw) {
            const u = clamp((t - e.tw.t0) / MOVE, 0, 1);
            e.x = mix(e.tw.from, e.tw.to, easeOut(u));
            if (u >= 1) e.tw = undefined;
            busy = true;
            continue;
          }
          e.v += (target - e.x) * SETTLE.k * dt;
          e.v *= Math.pow(SETTLE.d, dt);
          e.x += e.v * dt;
          if (Math.abs(target - e.x) < 0.02 && Math.abs(e.v) < 0.02) { e.x = target; e.v = 0; }
          else busy = true;
        }
        /* visited is full ink, the current one is the fill,
           the rest are empty. */
        const want = i < cur ? 1 : i === cur ? prog.current : 0;
        const next = still ? want : d.ink + (want - d.ink) * Math.min(1, 0.22 * dt);
        d.ink = Math.abs(want - next) < 0.002 ? want : next;
        if (d.ink !== want) busy = true;
      });

      if (wave.current && t - wave.current.t0 < LEAD + (wk.reach + 1) * wk.stagger + RISE) busy = true;
      else wave.current = null;

      setTick((k) => k + 1);
      raf.current = busy ? requestAnimationFrame(tick) : 0;
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => { cancelAnimationFrame(raf.current); raf.current = 0; }, []);
  useEffect(() => { run(); }, [n, pace, at, playing]);

  /* ── changing step ───────────────────────────────────────
     Every edge gets one timed move to its new place, and the
     wave is started from where the bar left. */
  function go(to, fromHand) {
    const { at: cur, n: count } = live.current;
    if (to === cur) return;
    const will = layout(count, to);
    const now = performance.now();
    if (!still) {
      dots.current.forEach((d, i) => {
        d.l.tw = { from: d.l.x, to: will[i][0], t0: now };
        d.r.tw = { from: d.r.x, to: will[i][1], t0: now };
      });
      wave.current = { t0: now, origin: to, from: cur };
    }
    live.current.at = to;
    setAt(to);
    if (fromHand) prog.current = 0;
    run();
  }

  const toggle = () => {
    if (playing) { setPlaying(false); return; }
    /* from the end, a press starts over */
    if (at === n - 1 && prog.current >= 1) {
      prog.current = 0;
      go(0, true);
    }
    setPlaying(true);
  };

  const pick = (i) => {
    if (i === at) return;
    go(i, true);
  };

  /* ── sincronização com um step controlado de fora ─────────
     Se o pai passar `currentStep` e ele divergir do step atual
     (ex: trocou o conteúdo do banner por fora), o player anima
     até lá, igual a um clique numa bolinha. */
  useEffect(() => {
    if (currentStep === undefined || currentStep === at) return;
    go(clamp(currentStep, 0, n - 1), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, n]);

  /* avisa o pai toda vez que o step muda de verdade, seja por
     clique, auto-avanço do próprio player ou sincronização acima */
  useEffect(() => {
    onStepChange?.(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  /* ── the wake, this frame ────────────────────────────────
     Only the dots the bar crossed, in the order it crossed
     them, and only as far back from the landing as the knob
     reaches; the landing bar answers last. */
  const now = performance.now();
  const shape = (d, i) => {
    let sy = 1;
    const w = wave.current;
    if (w) {
      const span = Math.abs(w.origin - w.from);
      const skip = Math.max(0, span - wk.reach);
      const lo = Math.min(w.from, w.origin);
      const hi = Math.max(w.from, w.origin);
      let delay = -1;
      let share = 1;
      if (i === w.origin) {
        delay = Math.min(span, wk.reach) * wk.stagger;
        share = wk.self;
      } else if (i >= lo && i <= hi) {
        const k = Math.abs(i - w.from);
        if (span - k <= wk.reach) delay = (k - skip) * wk.stagger;
      }
      if (delay >= 0) {
        const u = (now - w.t0 - LEAD - delay) / RISE;
        if (u > 0 && u < 1) sy = 1 + Math.sin(Math.PI * u) * wk.amp * share;
      }
    }
    return `translateX(${d.l.x.toFixed(2)}px) scaleY(${sy.toFixed(3)})`;
  };

  const width = layout(n, 0).at(-1)[1];

  return (
    <div
      className="flex flex-col items-center gap-3.5"
      data-playing={playing}
      role="group"
      aria-label={`Step ${at + 1} of ${n}`}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center justify-center bg-surface-secondary"
          style={{ padding: PAD, borderRadius: H / 2 }}
        >
          <div className="relative shrink-0" style={{ width, height: DOT }}>
            {dots.current.map((d, i) => {
              const w = Math.max(0, d.r.x - d.l.x);
              return (
                <button
                  key={i}
                  type="button"
                  className="spl-dot absolute left-0 top-0 h-full rounded-full border-0 bg-surface-tertiary p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-secondary"
                  aria-label={`Step ${i + 1}`}
                  aria-current={i === at ? "step" : undefined}
                  onClick={() => pick(i)}
                  style={{ transform: shape(d, i), width: w }}
                >
                  <i
                    className="absolute left-0 top-0 h-full rounded-full bg-brand"
                    style={{
                      width: d.ink > 0.001 ? Math.max(Math.min(DOT, w), w * d.ink) : 0,
                      opacity: i === at ? Math.min(1, d.ink * 14) : 1,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="spl-tool flex items-center justify-center bg-surface-secondary"
          style={{ width: H, height: H, borderRadius: H / 2 }}
        >
          <button
            type="button"
            className="grid h-full w-full cursor-pointer place-items-center rounded-[inherit] border-0 bg-transparent p-0 text-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-secondary"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
          >
            <Mark playing={playing} size={14} still={still} />
          </button>
        </div>
      </div>
    </div>
  );
}
