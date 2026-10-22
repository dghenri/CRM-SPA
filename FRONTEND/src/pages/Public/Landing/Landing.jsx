import { useEffect, useRef, useState } from "react";
import { Button, Separator, } from "@heroui/react";
import {
  Sparkles, CalendarCheck, ShieldCheck, ArrowRight, ArrowUp, ChevronDown, Copyright,
  Check, Mail, MapPin, Ticket,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../../../components/Navbar";
import ClientServicesPage from "../../../components/LandingServices";
import SpecularButton from "../../../components/SpecularButton"
import PageLoader from "../../../components/PageLoader";
import PlatformSection from "../../../components/PlatformSection";
import SectionCurve from "../../../components/SectionCurve";
import LocationCard from "../../../components/LocationCard";
import Reveal, { RevealProvider } from "../../../components/Reveal";
import useScrollVars from "../../../hooks/useScrollVars";

/* ------------------------------------------------------------------------------------------
 * DADOS DO STUDIO - troque pelos reais.
 * `mapsQuery` é o que o Google Maps pesquisa: pode ser o endereço completo ou o nome do local.
 * ---------------------------------------------------------------------------------------- */
const STUDIO = {
  name: "Viva Bem SPA",
  address: "Pelourinho, Salvador - BA", // TODO: endereço real do studio
  mapsQuery: "Pelourinho, Salvador - BA", // TODO: o mesmo endereço (ou o nome do local no Google Maps)
  email: "contato@vivabemspa.com",
};

// Desconto do cupom de boas-vindas (o mesmo que o sistema entrega na primeira sessão)
const WELCOME_DISCOUNT = "30%";

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: "Cuidado personalizado",
    text: "Protocolos pensados para o seu tipo de pele e objetivo, do relaxamento à estética avançada.",
  },
  {
    icon: CalendarCheck,
    title: "Agendamento simples",
    text: "Escolha o serviço, veja duração e preço, e confirme seu horário em poucos cliques.",
  },
  {
    icon: ShieldCheck,
    title: "Profissionais certificados",
    text: "Equipe especializada e ambiente preparado para cada procedimento, do início ao fim.",
  },
];

const ABOUT_POINTS = [
  "Terapias relaxantes e procedimentos estéticos avançados",
  "Equipe certificada em cada etapa do atendimento",
  "Ambiente pensado para o seu bem-estar",
];

// Fotos da seção "Sobre" (arquivos em public/). Troque por fotos do seu espaço quando tiver.
const ABOUT_IMAGES = [
  "/Wallpapers/background-photo-10632454.avif",
  "/Wallpapers/background-photo-6204267.avif",
  "/Wallpapers/background-photo-7301798.avif",
];

const FOOTER_LINKS = ["Sobre", "Blog", "Vagas", "Imprensa", "Acessibilidade", "Parceiros"];

const SOCIAL_LINKS = [
  { icon: "fa-facebook",  label: "Facebook",    href: "#" },
  { icon: "fa-instagram", label: "Instagram",   href: "#" },
  { icon: "fa-x-twitter", label: "X (Twitter)", href: "#" },
  { icon: "fa-github",    label: "Github",      href: "#" },
  { icon: "fa-youtube",   label: "Youtube",     href: "#" },
];

// Imagens que o carregador inicial espera antes de mostrar o site
const HERO_IMAGE = "/Wallpapers/background-photo-14868360.avif";
const PRELOAD_ASSETS = [HERO_IMAGE, "/LotusIcon.svg", "/Screens/home.webp"];

// O carregador completo aparece só na primeira visita da sessão; ao voltar para a landing
// vindo de outra página o site já abre direto (as animações de entrada continuam).
const LOADED_KEY = "viva-bem-spa:landing-loaded";
function wasLoadedBefore() {
  try {
    return sessionStorage.getItem(LOADED_KEY) === "1";
  } catch {
    return false;
  }
}

const EYEBROW = "text-sm font-semibold uppercase tracking-wide text-accent";

// Botão "voltar ao topo": aparece depois de rolar uma tela e meia
function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Voltar ao topo"
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-50 flex size-11 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white shadow-lg backdrop-blur transition-all duration-500 hover:-translate-y-1 hover:bg-black/80 hover:text-accent motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <ArrowUp size={18} aria-hidden="true" />
    </button>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [skipLoader] = useState(wasLoadedBefore);
  const [ready, setReady] = useState(skipLoader); // true = carregamento terminou, libera as animações

  useScrollVars(rootRef);

  useEffect(() => {
    document.documentElement.classList.add("no-scrollbar");

    return () => {
      document.documentElement.classList.remove("no-scrollbar");
    };
  }, []);

  function handleReady() {
    setReady(true);
    try {
      sessionStorage.setItem(LOADED_KEY, "1");
    } catch {
      /* sem sessionStorage: o carregador só aparece de novo na próxima visita */
    }
  }

  return (
    <RevealProvider ready={ready}>
      {/* brilho que passa pelo banner de cupom (só decoração; some com "reduzir movimento") */}
      <style>{`
        @keyframes landing-sheen { 0% { transform: translateX(-130%) skewX(-18deg); } 60%, 100% { transform: translateX(420%) skewX(-18deg); } }
        .landing-sheen { animation: landing-sheen 5s ease-in-out 1.5s infinite; }
        @media (prefers-reduced-motion: reduce) { .landing-sheen { animation: none; } }
      `}</style>

      {!skipLoader && <PageLoader assets={PRELOAD_ASSETS} onReady={handleReady} />}

      {/* "contents": só serve para guardar as variáveis de rolagem (--p e --page), não cria caixa no layout */}
      <div ref={rootRef} className="light contents" data-theme="light" style={{ colorScheme: "light" }}>
        {/* Barra de progresso da leitura */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-70 h-0.5 origin-left bg-accent"
          style={{ transform: "scaleX(var(--page, 0))" }}
        />

        <Navbar overHero />

        <main className="flex w-full flex-col items-center overflow-x-clip bg-overlay">
          {/* Hero */}
          <section id="hero" className="relative isolate w-full h-screen overflow-hidden">
            {/* Camada de imagem + overlays, isolada em um wrapper com overflow-hidden */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-default">
              {/* entrada: a foto "assenta" (zoom out + fade) quando o carregamento termina */}
              <div
                className={`h-full w-full transition-[transform,opacity] duration-1800 ease-out motion-reduce:transition-none ${
                  ready ? "scale-100 opacity-100" : "scale-110 opacity-0"
                }`}
              >
                {/* parallax: a foto desce mais devagar que a página (e dá um leve zoom) ao rolar */}
                <img
                  className="h-full w-full object-cover object-[center_30%] will-change-transform"
                  style={{ transform: "translate3d(0, calc(var(--p, 0) * 60px), 0) scale(1.15)" }}
                  src={HERO_IMAGE}
                  alt="Background"
                />
              </div>
              {/* Escurece a imagem de leve para o texto ter contraste */}
              <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/10 to-black/5" />
              {/* Escurece a base da foto para o texto e o botão ficarem legíveis */}
              <div className="absolute inset-x-0 bottom-0 h-72 bg-linear-to-b from-transparent to-black/55" />
              {/* Borda curva: a cor da página sobe sobre a foto (no lugar de um degradê) */}
              <SectionCurve position="top" inside className="text-overlay" />
            </div>

            {/* o texto sobe e some aos poucos conforme a página rola */}
            <div
              className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-6 px-6 pb-44 pt-28 text-center"
              style={{ opacity: "calc(1 - var(--p, 0) * 1.5)", transform: "translate3d(0, calc(var(--p, 0) * -48px), 0)" }}
            >

              <Reveal
                as="h1"
                distance={44}
                duration={1100}
                className="font-serif text-4xl font-bold leading-tight text-white drop-shadow-md md:text-6xl"
              >
                Seu momento de cuidado
                <br /> começa aqui
              </Reveal>

              <Reveal as="p" delay={200} duration={1000} className="max-w-2xl text-md text-white/90 drop-shadow-sm md md:text-lg">
                Massagens, estética facial e corporal em um só lugar. Explore nossos
                procedimentos, escolha o que combina com você e agende em minutos.
              </Reveal>

              <Reveal delay={400} duration={1000} direction="zoom" className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <SpecularButton
                  size="md"
                  radius={30}
                  tint="#000000"
                  tintOpacity={0}
                  blur={2}
                  textColor="#f5f5f5"
                  lineColor="#fdc700"
                  baseColor="#525252"
                  intensity={1}
                  shineSize={20}
                  shineFade={40}
                  thickness={1}
                  speed={0.35}
                  followMouse={false}
                  proximity={170}
                  autoAnimate
                  onClick={() => navigate("/register")}
                  shadow="0 8px 24px rgba(0,0,0,0.25)"
                  hoverShadow="0 14px 44px rgba(253,199,0,0.28)"
                  className="hover:-translate-y-1"
                >
                  Criar minha conta
                </SpecularButton>
              </Reveal>
            </div>

            {/* indicador de rolagem: some assim que a pessoa começa a rolar */}
            <Reveal direction="fade" delay={1100} duration={1200} className="absolute inset-x-0 bottom-20 z-10 flex justify-center lg:bottom-28">
              <a
                href="#diferenciais"
                aria-label="Role para ver mais"
                className="flex flex-col items-center gap-1 text-xs tracking-widest text-white/70 uppercase transition-colors hover:text-white"
                style={{ opacity: "calc(1 - var(--p, 0) * 5)" }}
              >
                Role para explorar
                <ChevronDown size={20} className="animate-bounce motion-reduce:animate-none" aria-hidden="true" />
              </a>
            </Reveal>
          </section>

          {/* Cupom de boas-vindas */}
          <section className="w-full px-6 pt-6" aria-label="Cupom de boas-vindas">
            <Reveal direction="zoom" duration={1000} className="mx-auto max-w-5xl">
              <div className="group relative overflow-hidden rounded-3xl bg-black p-8 text-white shadow-xl sm:p-10">
                <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-blue-600/60 blur-3xl transition-transform duration-700 group-hover:scale-125" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-indigo-500/25 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-transparent via-white/10 to-transparent landing-sheen" />

                <div className="relative flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110">
                      <Ticket size={26} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="font-serif text-2xl font-bold md:text-3xl">
                        Ganhe {WELCOME_DISCOUNT} de desconto na primeira sessão
                      </h2>
                      <p className="mt-1 text-sm text-white/70 md:text-base">
                        É só criar sua conta: o cupom de boas-vindas já fica disponível para você.
                      </p>
                    </div>
                  </div>
                  <Button
                    onPress={() => navigate("/register")}
                    className="shrink-0 rounded-full bg-white px-6 font-semibold text-black transition-transform duration-300 hover:scale-105 active:scale-95"
                  >
                    Quero meu cupom
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </Reveal>
          </section>

          {/* Diferenciais */}
          <section id="diferenciais" className="w-full scroll-mt-32 px-6 mt-20">
            <div className="mx-auto gap-6 sm:grid grid md:grid-cols-2 lg:flex max-w-5xl">
              {HIGHLIGHTS.map(({ icon: Icon, title, text }, index) => (
                <Reveal key={title} delay={index * 140} className="min-w-65 shrink-0 sm:min-w-0 sm:shrink">
                  <div className="group h-full rounded-2xl border border-border bg-surface p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-accent/40 hover:shadow-xl">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                      <Icon size={22} />
                    </div>
                    <h3 className="mb-1 font-serif text-lg font-semibold text-foreground">{title}</h3>
                    <p className="text-sm text-muted">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <Reveal direction="line" duration={1200} className="my-16 w-full max-w-5xl">
            <Separator />
          </Reveal>

          {/* Procedimentos (lado do cliente): os cards animam por conta própria */}
          <section id="procedimentos" className="w-full scroll-mt-32 pb-24">
            <div className="mx-auto max-w-6xl">
              <ClientServicesPage />
            </div>
          </section>

          {/* Plataforma: o sistema do cliente dentro de um iPhone */}
          <PlatformSection />

          {/* Sobre */}
          <section id="sobre" className="w-full scroll-mt-32 bg-surface px-6 py-24">
            <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
              <div className="flex flex-col items-start gap-5 text-left">
                <Reveal direction="line" duration={1000} className="h-0.5 w-16 rounded-full bg-accent" />
                <Reveal as="p" className={EYEBROW}>Quem somos</Reveal>
                <Reveal as="h2" delay={100} className="font-serif text-3xl font-bold text-foreground md:text-4xl">Sobre o Viva Bem SPA</Reveal>
                <Reveal as="p" delay={200} className="max-w-xl text-muted">
                  Somos um espaço dedicado ao cuidado com o corpo e a mente, unindo terapias
                  relaxantes e procedimentos estéticos avançados em um ambiente pensado para
                  o seu bem-estar, com uma equipe certificada em cada etapa do atendimento.
                </Reveal>
                <ul className="mt-2 flex flex-col gap-3">
                  {ABOUT_POINTS.map((point, index) => (
                    <Reveal as="li" key={point} delay={300 + index * 120} direction="left" distance={24} className="flex items-center gap-3 text-foreground">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <Check size={16} aria-hidden="true" />
                      </span>
                      {point}
                    </Reveal>
                  ))}
                </ul>
              </div>

              {/* mosaico de fotos */}
              <div className="grid h-112 grid-cols-2 grid-rows-2 gap-4 sm:h-128">
                {ABOUT_IMAGES.map((src, index) => (
                  <Reveal
                    key={src}
                    delay={index * 150}
                    distance={40}
                    className={`group overflow-hidden rounded-3xl shadow-lg ${index === 0 ? "row-span-2" : ""}`}
                  >
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
                    />
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* Contato + localização */}
          <section id="contato" className="w-full scroll-mt-32 px-6 py-24">
            <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
              <div className="flex flex-col items-start gap-5 text-left">
                <Reveal as="p" className={EYEBROW}>Contato</Reveal>
                <Reveal as="h2" delay={100} className="font-serif text-3xl font-bold text-foreground md:text-4xl">Fale conosco</Reveal>
                <Reveal as="p" delay={200} className="max-w-md text-muted">
                  Tem dúvidas sobre algum serviço ou quer agendar por telefone? Nossa equipe
                  está pronta para te atender.
                </Reveal>

                <ul className="mt-1 flex flex-col gap-4">
                  <Reveal as="li" delay={300} direction="left" distance={24} className="flex items-center gap-3 text-foreground">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <MapPin size={18} aria-hidden="true" />
                    </span>
                    {STUDIO.address}
                  </Reveal>
                  <Reveal as="li" delay={420} direction="left" distance={24} className="flex items-center gap-3 text-foreground">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <Mail size={18} aria-hidden="true" />
                    </span>
                    {STUDIO.email}
                  </Reveal>
                </ul>

                <Reveal delay={540} direction="zoom">
                  <Button asChild variant="primary" size="lg" className="rounded-full transition-transform duration-300 hover:scale-105 active:scale-95">
                    <a href={`mailto:${STUDIO.email}`} className="inline-flex items-center gap-2">
                      Enviar e-mail
                      <ArrowRight size={18} />
                    </a>
                  </Button>
                </Reveal>
              </div>

              <Reveal direction="right" distance={48} duration={1000}>
                <LocationCard name={STUDIO.name} address={STUDIO.address} query={STUDIO.mapsQuery} />
              </Reveal>
            </div>
          </section>

          {/* CTA final */}
          <section className="relative w-full overflow-hidden bg-accent/10 px-6 py-20">
            <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 size-80 rounded-full bg-accent/15 blur-3xl" />
            <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
              <Reveal as="h2" className="font-serif text-3xl font-bold text-foreground md:text-4xl">
                Pronta para agendar seu primeiro horário?
              </Reveal>
              <Reveal as="p" delay={150} className="text-muted">
                Crie sua conta gratuita e comece a cuidar de você hoje mesmo.
              </Reveal>
              <Reveal delay={300} direction="zoom">
                <Button asChild variant="primary" size="lg" className="rounded-full transition-transform duration-300 hover:scale-105 active:scale-95">
                  <Link to="/register" className="inline-flex items-center gap-2">
                    Começar agora
                    <ArrowRight size={18} />
                  </Link>
                </Button>
              </Reveal>
            </div>
          </section>

          <footer className="w-full bg-background px-6 py-16"> {/* bg-slate-950 */}
            <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 text-center">
              <Reveal as="nav" direction="fade" duration={1000} className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-400">
                {FOOTER_LINKS.map((label) => (
                  <a
                    key={label}
                    href="#"
                    className="transition-colors hover:text-accent"
                  >
                    {label}
                  </a>
                ))}
              </Reveal>

              <div className="flex items-center gap-5">
                {SOCIAL_LINKS.map(({ icon, label, href }, index) => (
                  <Reveal key={label} delay={index * 90} distance={20} className="flex">
                    <a
                      href={href}
                      aria-label={label}
                      className="text-slate-400 transition duration-300 hover:-translate-y-1 hover:text-accent"
                    >
                      <i className={`fa-brands ${icon} text-xl`} aria-hidden="true"></i>
                    </a>
                  </Reveal>
                ))}
              </div>

              <Reveal direction="fade" duration={1000} className="flex items-center gap-1 text-slate-500">
                <Copyright size={15} className="mt-0.5" />
                <p className="text-sm ">
                  {new Date().getFullYear()} Viva Bem SPA. Todos os direitos reservados.
                </p>
              </Reveal>

            </div>
          </footer>
        </main>

        <BackToTop />
      </div>
    </RevealProvider>
  );
}
