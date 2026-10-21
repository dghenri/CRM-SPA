import { useEffect, useState } from "react";

// Tela de carregamento inicial: carrega (e decodifica) as imagens importantes + as fontes antes de
// mostrar o site. Quando termina, some com um fade e avisa `onReady`, que libera as animações.
//
//   <PageLoader assets={["/Wallpapers/foto.avif"]} onReady={() => setReady(true)} />
//
// Regras: fica no mínimo `minMs` na tela (para não "piscar") e no máximo `timeoutMs`
// (internet lenta nunca prende o visitante). Enquanto carrega, a rolagem da página fica travada.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = src;
    const done = () => resolve();
    if (image.decode) image.decode().then(done, done);
    else {
      image.onload = done;
      image.onerror = done;
    }
  });
}

export default function PageLoader({ assets = [], onReady, minMs = 900, timeoutMs = 8000, title = "Viva Bem SPA" }) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  // trava a rolagem enquanto o carregador está na tela
  useEffect(() => {
    if (gone) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [gone]);

  useEffect(() => {
    let cancelled = false;
    const timers = [];

    const tasks = [...assets.map(preloadImage), document.fonts?.ready ?? Promise.resolve()];
    let finished = 0;
    const tracked = tasks.map((task) =>
      Promise.resolve(task)
        .catch(() => {})
        .then(() => {
          finished += 1;
          if (!cancelled) setProgress(Math.round((finished / tasks.length) * 100));
        }),
    );

    Promise.all([Promise.race([Promise.all(tracked), wait(timeoutMs)]), wait(minMs)]).then(() => {
      if (cancelled) return;
      setProgress(100);
      setLeaving(true);
      timers.push(setTimeout(() => onReady?.(), 350)); // as animações começam com o fade ainda rolando
      timers.push(setTimeout(() => !cancelled && setGone(true), 900));
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // roda uma vez: assets e onReady são fixos durante o carregamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando"
      className={`fixed inset-0 z-100 flex flex-col items-center justify-center gap-7 bg-black text-white transition-opacity duration-700 ease-out ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <img src="/LotusIcon.svg" alt="" className="size-14 animate-pulse brightness-0 invert" />
      <p className="font-serif text-2xl tracking-wide">{title}</p>
      <div className="h-0.5 w-48 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className="h-full rounded-full bg-yellow-400 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
