import { useEffect } from "react";
import { Button, Chip, Separator, toast, } from "@heroui/react";
import { Sparkles, CalendarCheck, ShieldCheck, ArrowRight, Copyright, } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import ClientServicesPage from "../../components/LandingServices";
import SpecularButton from "../../components/SpecularButton"


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
  { icon: "fa-facebook", label: "Facebook", href: "#" },
  { icon: "fa-instagram", label: "Instagram", href: "#" },
  { icon: "fa-x-twitter", label: "X (Twitter)", href: "#" },
  { icon: "fa-github", label: "Github", href: "#" },
  { icon: "fa-youtube", label: "Youtube", href: "#" },
];

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add("no-scrollbar");

    return () => {
      document.documentElement.classList.remove("no-scrollbar");
    };
  }, []);

  return (
    <>
      <Navbar />

      <main className="flex bg-white flex-col items-center">
        {/* Hero */}
        <section id="hero" className="relative isolate w-full h-screen h-dvh overflow-hidden">
          {/* Camada de imagem + overlays, isolada em um wrapper com overflow-hidden */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-default">
            <img
              className="h-full w-full object-cover object-[center_30%]"
              src="/background-photo-7301798.avif"
              alt="Background"
            />
            {/* Escurece a imagem de leve para o texto ter contraste */}
            <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/10 to-black/5" />
            {/* Transição suave da imagem para a cor de fundo da página */}
            <div className="absolute inset-x-0 bottom-0 h-92 bg-linear-to-b from-transparent to-black" />
          </div>

          <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-6 px-6 pb-24 text-center mt-60">

            <h1 className="font-serif text-4xl font-bold leading-tight text-white drop-shadow-md md:text-6xl">
              Seu momento de cuidado
              <br /> começa aqui
            </h1>

            <p className="max-w-2xl text-md text-white/90 drop-shadow-sm md md:text-lg">
              Massagens, estética facial e corporal em um só lugar. Explore nossos
              procedimentos, escolha o que combina com você e agende em minutos.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
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
            </div>
          </div>
        </section>

        {/* Fade extra para suavizar a costura entre o hero e a próxima seção */}
        <div className="pointer-events-none h-24 w-full bg-linear-to-b from-black to-transparent" />

        {/* Diferenciais */}
        <section id="diferenciais" className="w-full scroll-mt-32 px-6 mt-30">
          <div className="mx-auto gap-6 sm:grid grid md:grid-cols-2 lg:flex max-w-5xl">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="min-w-65 shrink-0 rounded-large border border-default-100 bg-content1 p-6 text-center shadow-sm sm:min-w-0 sm:shrink"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary">
                  <Icon size={22} />
                </div>
                <h3 className="mb-1 font-serif text-lg font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-default-500">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <Separator className="my-16 max-w-5xl" />

        {/* Procedimentos (lado do cliente) */}
        <section id="procedimentos" className="w-full scroll-mt-32 pb-24">
          <div className="mx-auto max-w-6xl">
            <ClientServicesPage />
          </div>
        </section>

        {/* Sobre */}
        <section id="sobre" className="w-full scroll-mt-32 bg-content1 px-6 py-20">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <h2 className="font-serif text-3xl font-bold text-foreground">Sobre o Viva Bem SPA</h2>
            <p className="max-w-2xl text-default-500">
              Somos um espaço dedicado ao cuidado com o corpo e a mente, unindo terapias
              relaxantes e procedimentos estéticos avançados em um ambiente pensado para
              o seu bem-estar, com uma equipe certificada em cada etapa do atendimento.
            </p>
          </div>
        </section>

        {/* Contato */}
        <section id="contato" className="w-full scroll-mt-32 px-6 py-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <h2 className="font-serif text-3xl font-bold text-foreground">Fale conosco</h2>
            <p className="text-default-500">
              Tem dúvidas sobre algum serviço ou quer agendar por telefone? Nossa equipe
              está pronta para te atender.
            </p>
            <Button asChild variant="primary" size="lg" className="rounded-full">
              <a href="mailto:contato@vivabemspa.com" className="inline-flex items-center gap-2">
                Enviar e-mail
                <ArrowRight size={18} />
              </a>
            </Button>
          </div>
        </section>

        {/* CTA final */}
        <section className="w-full bg-primary-50 px-6 py-16">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <h2 className="font-serif text-3xl font-bold text-foreground">
              Pronta para agendar seu primeiro horário?
            </h2>
            <p className="text-default-500">
              Crie sua conta gratuita e comece a cuidar de você hoje mesmo.
            </p>
            <Button asChild variant="primary" size="lg" className="rounded-full">
              <Link to="/cadastro" className="inline-flex items-center gap-2">
                Começar agora
                <ArrowRight size={18} />
              </Link>
            </Button>
          </div>
        </section>

        <footer className="w-full bg-background px-6 py-16"> {/* bg-slate-950 */}
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 text-center">
            <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-400">
              {FOOTER_LINKS.map((label) => (
                <a
                  key={label}
                  href="#"
                  className="transition-colors hover:text-accent"
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-5">
              {SOCIAL_LINKS.map(({ icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="text-slate-400 transition-colors hover:text-accent"
                >
                  <i className={`fa-brands ${icon} text-xl`} aria-hidden="true"></i>
                </a>
              ))}
            </div>

            <div className="flex items-center gap-1 text-slate-500">
              <Copyright size={15} className="mt-0.5" />
              <p className="text-sm ">
                {new Date().getFullYear()} Viva Bem SPA. Todos os direitos reservados.
              </p>
            </div>
            
          </div>
        </footer>
      </main>
    </>
  );
}
