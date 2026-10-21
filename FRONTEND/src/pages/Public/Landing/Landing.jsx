import { useEffect, useRef, useState } from "react";
import { Button, Separator, } from "@heroui/react";
import { Sparkles, CalendarCheck, ShieldCheck, ArrowRight, ArrowUp, ChevronDown, Copyright, } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../../../components/Navbar";
import ClientServicesPage from "../../../components/LandingServices";
import SpecularButton from "../../../components/SpecularButton"
import PageLoader from "../../../components/PageLoader";
import Reveal, { RevealProvider } from "../../../components/Reveal";
import useScrollVars from "../../../hooks/useScrollVars";

/* Adicionar uma banner de aviso de cupom para as primeiras sessões aqui */
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
const PRELOAD_ASSETS = [HERO_IMAGE, "/LotusIcon.svg"];

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
      {!skipLoader && <PageLoader assets={PRELOAD_ASSETS} onReady={handleReady} />}

      {/* "contents": só serve para guardar as variáveis de rolagem (--p e --page), não cria caixa no layout */}
      <div ref={rootRef} className="contents">
        {/* Barra de progresso da leitura */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-70 h-0.5 origin-left bg-accent"
          style={{ transform: "scaleX(var(--page, 0))" }}
        />

        <Navbar />

        <main className="flex bg-overlay flex-col items-center">
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
              {/* Transição suave da imagem para a cor de fundo da página */}
              <div className="absolute inset-x-0 bottom-0 h-92 bg-linear-to-b from-transparent to-black" />
            </div>

            {/* o texto sobe e some aos poucos conforme a página rola */}
            <div
              className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-6 px-6 pb-24 text-center mt-60"
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
                  className="shadow-xl shadow-transparent transition-all duration-800 ease-out hover:-translate-y-1 hover:shadow-yellow-500/20"
                >
                  Criar minha conta
                </SpecularButton>
              </Reveal>
            </div>

            {/* indicador de rolagem: some assim que a pessoa começa a rolar */}
            <Reveal direction="fade" delay={1000} duration={1200} className="absolute inset-x-0 bottom-10 flex justify-center">
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

          {/* Fade extra para suavizar a costura entre o hero e a próxima seção */}
          <div className="pointer-events-none h-24 w-full bg-linear-to-b from-black to-transparent" />

          {/* Diferenciais */}
          <section id="diferenciais" className="w-full scroll-mt-32 px-6 mt-30">
            <div className="mx-auto gap-6 sm:grid grid md:grid-cols-2 lg:flex max-w-5xl">
              {HIGHLIGHTS.map(({ icon: Icon, title, text }, index) => (
                <Reveal key={title} delay={index * 140} className="min-w-65 shrink-0 sm:min-w-0 sm:shrink">
                  <div className="group h-full rounded-large border border-default-100 bg-content1 p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-accent/40 hover:shadow-xl">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                      <Icon size={22} />
                    </div>
                    <h3 className="mb-1 font-serif text-lg font-semibold text-foreground">{title}</h3>
                    <p className="text-sm text-default-500">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <Reveal direction="line" duration={1200} className="my-16 w-full max-w-5xl">
            <Separator />
          </Reveal>

          {/* Procedimentos (lado do cliente) */}
          <section id="procedimentos" className="w-full scroll-mt-32 pb-24">
            <Reveal distance={48} duration={1000} className="mx-auto max-w-6xl">
              <ClientServicesPage />
            </Reveal>
          </section>

          {/* Sobre */}
          <section id="sobre" className="w-full scroll-mt-32 bg-content1 px-6 py-20">
            <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
              <Reveal direction="line" duration={1000} className="h-0.5 w-16 rounded-full bg-accent" />
              <Reveal as="h2" className="font-serif text-3xl font-bold text-foreground">Sobre o Viva Bem SPA</Reveal>
              <Reveal as="p" delay={150} className="max-w-2xl text-default-500">
                Somos um espaço dedicado ao cuidado com o corpo e a mente, unindo terapias
                relaxantes e procedimentos estéticos avançados em um ambiente pensado para
                o seu bem-estar, com uma equipe certificada em cada etapa do atendimento.
              </Reveal>
            </div>
          </section>

          {/* Contato */}
          <section id="contato" className="w-full scroll-mt-32 px-6 py-20">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
              <Reveal as="h2" className="font-serif text-3xl font-bold text-foreground">Fale conosco</Reveal>
              <Reveal as="p" delay={150} className="text-default-500">
                Tem dúvidas sobre algum serviço ou quer agendar por telefone? Nossa equipe
                está pronta para te atender.
              </Reveal>
              <Reveal delay={300} direction="zoom">
                <Button asChild variant="primary" size="lg" className="rounded-full transition-transform duration-300 hover:scale-105 active:scale-95">
                  <a href="mailto:contato@vivabemspa.com" className="inline-flex items-center gap-2">
                    Enviar e-mail
                    <ArrowRight size={18} />
                  </a>
                </Button>
              </Reveal>
            </div>
          </section>

          {/* CTA final */}
          <section className="w-full bg-primary-50 px-6 py-16">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
              <Reveal as="h2" className="font-serif text-3xl font-bold text-foreground">
                Pronta para agendar seu primeiro horário?
              </Reveal>
              <Reveal as="p" delay={150} className="text-default-500">
                Crie sua conta gratuita e comece a cuidar de você hoje mesmo.
              </Reveal>
              <Reveal delay={300} direction="zoom">
                <Button asChild variant="primary" size="lg" className="rounded-full transition-transform duration-300 hover:scale-105 active:scale-95">
                  <Link to="/cadastro" className="inline-flex items-center gap-2">
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
