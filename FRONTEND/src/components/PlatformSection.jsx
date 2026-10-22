import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, CreditCard, Heart, History, Settings, Smartphone, Sparkles } from "lucide-react";
import PhoneMockup from "./PhoneMockup";
import SectionCurve from "./SectionCurve";
import Reveal from "./Reveal";

// Seção "Plataforma": mostra o sistema do cliente (prints reais em /public/Screens) dentro de um iPhone.
//  1) AppShowcase  - "scrollytelling": o aparelho fica fixo na tela e a imagem troca conforme a pessoa rola.
//  2) BookingSteps - o fluxo de agendamento em 4 passos, com um aparelho por passo.
// Para trocar textos ou prints, edite as listas SHOWCASE e BOOKING logo abaixo.

const SHOWCASE = [
  {
    id: "home",
    icon: Smartphone,
    title: "Tudo à mão assim que você entra",
    text: "Atalhos para agendar, ver seus agendamentos, favoritos, histórico e cupons, além de sugestões de procedimentos escolhidas para você.",
    chips: ["Atalhos rápidos", "Cupons", "Sugestões"],
    src: "/Screens/home.webp",
    alt: "Tela inicial do aplicativo, com atalhos, cupom de boas-vindas e sugestões de procedimentos",
  },
  {
    id: "history",
    icon: History,
    title: "Seus agendamentos num só lugar",
    text: "Acompanhe o status de cada sessão, veja o profissional responsável e confirme pelo WhatsApp com um toque.",
    chips: ["Status da sessão", "WhatsApp", "Novo agendamento"],
    src: "/Screens/history.webp",
    alt: "Tela com o histórico de agendamentos e o botão para confirmar pelo WhatsApp",
  },
  {
    id: "settings",
    icon: Settings,
    title: "Sua conta do seu jeito",
    text: "Endereços, telefone, senha, preferências de notificação e tema claro, escuro ou automático, tudo em um lugar só.",
    chips: ["Endereços", "Notificações", "Tema claro/escuro"],
    src: "/Screens/settings.webp",
    alt: "Tela de perfil com as configurações da conta e do aplicativo",
  },
];

const BOOKING = [
  {
    n: 1,
    label: "Procedimento",
    icon: Sparkles,
    text: "Veja foto, duração, profissional, idade mínima e valor. Favorite o que gostou e toque em iniciar.",
    src: "/Screens/detail.webp",
    alt: "Tela de detalhes de um procedimento, com descrição e o botão Iniciar agendamento",
  },
  {
    n: 2,
    label: "Data e horário",
    icon: CalendarCheck,
    text: "Um calendário com os dias disponíveis e os horários livres do profissional.",
    src: "/Screens/date.webp",
    alt: "Tela de agendamento com o calendário do mês e os horários disponíveis",
  },
  {
    n: 3,
    label: "Pagamento",
    icon: CreditCard,
    text: "Pix, cartão de crédito, débito ou dinheiro, com um campo para aplicar o seu cupom de desconto.",
    src: "/Screens/payment.webp",
    alt: "Tela com as formas de pagamento e o campo de cupom de desconto",
  },
  {
    n: 4,
    label: "Confirmação",
    icon: Check,
    text: "Confira o resumo e confirme. O horário fica reservado imediatamente.",
    src: "/Screens/summary.webp",
    alt: "Tela com o resumo do agendamento e o botão Confirmar agendamento",
  },
];

const SCROLL_PER_STEP = 60; // vh de rolagem para cada passo do showcase

function AppShowcase() {
  const sectionRef = useRef(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const range = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / range));
      element.style.setProperty("--sp", progress.toFixed(4)); // inclina o aparelho conforme a rolagem
      setActive(Math.min(SHOWCASE.length - 1, Math.floor(progress * SHOWCASE.length)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // clicar num passo rola a página até o trecho dele
  function goTo(index) {
    const element = sectionRef.current;
    if (!element) return;
    const range = Math.max(1, element.offsetHeight - window.innerHeight);
    const top = element.getBoundingClientRect().top + window.scrollY + ((index + 0.5) / SHOWCASE.length) * range;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <div ref={sectionRef} className="relative w-full" style={{ height: `calc(100vh + ${SHOWCASE.length * SCROLL_PER_STEP}vh)` }}>
      <div className="sticky top-0 flex h-screen w-full items-center overflow-hidden">
        {/* brilho de fundo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 size-[44rem] max-h-[96%] max-w-[140vw] -translate-x-1/2 -translate-y-1/2 bg-blue-600/30 [mask-image:radial-gradient(closest-side,black,transparent)] lg:left-[68%]"
        />

        <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center gap-5 px-6 pb-6 pt-28 lg:flex-row lg:gap-20 lg:pt-24">
          {/* aparelho */}
          <div className="flex shrink-0 items-center justify-center lg:order-2" style={{ perspective: "1400px" }}>
            <div
              className="w-[clamp(120px,19vh,200px)] lg:w-[clamp(230px,36vh,350px)]"
              style={{ transform: "rotateY(calc((0.5 - var(--sp, 0)) * 16deg)) rotateX(3deg) translateY(calc((0.5 - var(--sp, 0)) * 24px))" }}
            >
              <PhoneMockup>
                {SHOWCASE.map((step, index) => (
                  <img
                    key={step.id}
                    src={step.src}
                    alt={step.alt}
                    width={760}
                    height={1647}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    aria-hidden={index !== active}
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none"
                    style={{ opacity: index === active ? 1 : 0 }}
                  />
                ))}
              </PhoneMockup>
            </div>
          </div>

          {/* passos */}
          <ol className="flex w-full max-w-md flex-col gap-1 lg:order-1 lg:max-w-lg">
            {SHOWCASE.map((step, index) => {
              const on = index === active;
              const Icon = step.icon;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={on ? "step" : undefined}
                    className={`flex w-full items-start gap-4 rounded-2xl px-4 py-3 text-left transition-colors duration-300 ${on ? "bg-white/8" : "hover:bg-white/5"}`}
                  >
                    <span
                      className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
                        on ? "scale-110 bg-blue-500 text-white shadow-lg shadow-blue-500/40" : "bg-white/10 text-white/60"
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-serif text-lg font-semibold transition-colors duration-300 lg:text-xl ${on ? "text-white" : "text-white/45"}`}>
                        {step.title}
                      </span>
                      <span className={`grid transition-[grid-template-rows,opacity] duration-500 motion-reduce:transition-none ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                        <span className="overflow-hidden">
                          <span className="block pt-1.5 text-sm text-white/70 lg:text-base">{step.text}</span>
                          <span className="flex flex-wrap gap-2 pt-3">
                            {step.chips.map((chip) => (
                              <span key={chip} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
                                {chip}
                              </span>
                            ))}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function BookingSteps() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-40 pt-16">
      <div className="mx-auto mb-14 flex max-w-2xl flex-col items-center gap-3 text-center">
        <Reveal as="p" className="text-sm font-semibold uppercase tracking-wide text-blue-400">
          Agendamento
        </Reveal>
        <Reveal as="h3" delay={100} className="font-serif text-3xl font-bold md:text-4xl">
          Do clique à confirmação em 4 passos
        </Reveal>
        <Reveal as="p" delay={200} className="text-white/70">
          Sem ligação e sem fila: escolha o procedimento, o horário e a forma de pagamento, e confirme tudo na mesma tela.
        </Reveal>
      </div>

      {/* no celular, os aparelhos rolam para o lado; a partir do md viram uma grade */}
      <ol className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-6 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-14 md:overflow-visible md:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {BOOKING.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.n} className="group relative w-[68vw] max-w-65 shrink-0 snap-center md:w-auto md:max-w-none">
              {/* linha ligando um passo ao próximo */}
              {index < BOOKING.length - 1 && (
                <Reveal
                  direction="line"
                  delay={index * 180 + 300}
                  duration={900}
                  className="absolute left-[calc(50%+1.75rem)] right-[calc(-50%+1.75rem)] top-5 hidden h-px bg-linear-to-r from-blue-400/70 to-white/10 lg:block"
                />
              )}

              <Reveal delay={index * 150} className="flex flex-col items-center gap-5 text-center">
                <span className="relative z-10 flex items-center gap-2 rounded-full border border-white/15 bg-neutral-950 px-3 py-2 text-sm font-semibold">
                  <span className="flex size-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold">{step.n}</span>
                  {step.label}
                </span>

                <div className={`w-full max-w-60 transition-transform duration-500 ease-out group-hover:-translate-y-2 ${index % 2 === 1 ? "lg:mt-10" : ""}`}>
                  <PhoneMockup src={step.src} alt={step.alt} />
                </div>

                <p className="flex max-w-60 items-start gap-2 text-sm text-white/70">
                  <Icon size={16} className="mt-0.5 shrink-0 text-blue-400" aria-hidden="true" />
                  <span className="text-left">{step.text}</span>
                </p>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function PlatformSection() {
  return (
    <section id="plataforma" className="relative w-full scroll-mt-32 bg-neutral-950 text-white">
      {/* bordas curvas (arco com fio de luz) no lugar de degradês */}
      <SectionCurve position="top" glow className="text-neutral-950" />
      <SectionCurve position="bottom" glow className="text-neutral-950" />

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pb-4 pt-28 text-center">
        <Reveal as="p" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-400">
          <Heart size={14} aria-hidden="true" />
          Plataforma completa
        </Reveal>
        <Reveal as="h2" delay={100} className="font-serif text-4xl font-bold md:text-5xl">
          Seu spa na palma da mão
        </Reveal>
        <Reveal as="p" delay={200} className="max-w-xl text-white/70">
          Crie sua conta e tenha um sistema completo para cuidar de você: agende, acompanhe, pague do seu jeito e mantenha seu perfil em dia,
          direto do navegador, no celular ou no computador.
        </Reveal>
      </div>

      <AppShowcase />
      <BookingSteps />
    </section>
  );
}
