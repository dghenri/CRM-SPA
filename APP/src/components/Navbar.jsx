import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@heroui/react";
import { Menu, X } from 'lucide-react';


// Cada id precisa existir como <section id="..."> na página onde a Navbar
// for usada (hoje, a Landing), assim como a seção "hero" (ver
// HOME_SECTION_ID abaixo). Em páginas sem essas seções, o scroll spy e o
// clique na logo simplesmente ficam inativos (fallback para navegação normal).
const NAV_LINKS = [
  { id: "diferenciais", label: "Diferenciais" },
  { id: "procedimentos", label: "Procedimentos" },
  { id: "sobre", label: "Sobre" },
  { id: "contato", label: "Contato" },
];

// Altura aproximada do header fixo (h-20 = 80px + mt-8 = 32px + folga)
const HEADER_OFFSET = 130;

// Seção que a logo leva de volta ao ser clicada
const HOME_SECTION_ID = "hero";

export default function Navbar() {
  const [activeId, setActiveId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Ordem precisa bater com a ordem das seções na página (hero primeiro).
    const sections = [{ id: HOME_SECTION_ID }, ...NAV_LINKS]
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean);

    if (sections.length === 0) return;

    // Em vez de basear a seção ativa na intersectionRatio (que falha para
    // seções muito mais altas que a viewport, como "servicos" — uma seção
    // pequena saindo de tela pode ter ratio maior que uma grande só
    // começando a aparecer), marcamos como ativa a última seção cujo topo
    // já foi ultrapassado pela linha logo abaixo do header fixo.
    let ticking = false;

    const updateActiveId = () => {
      ticking = false;
      const scrollLine = window.scrollY + HEADER_OFFSET + 1;

      let current = sections[0].id;
      for (const section of sections) {
        const top = section.getBoundingClientRect().top + window.scrollY;
        if (top <= scrollLine) {
          current = section.id;
        } else {
          break;
        }
      }
      setActiveId(current);
    };

    const onScrollOrResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateActiveId);
    };

    updateActiveId();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  const handleNavClick = (event, id) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (!el) return; // seção não existe nesta página — deixa o link normal
    event.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    window.scrollTo({ top, behavior: "smooth" });
  };

  // Clique na logo: se a seção hero existir na página atual, faz o mesmo
  // scroll suave usado pelos links do menu; caso contrário, deixa o <Link>
  // navegar normalmente para a rota "/".
  const handleLogoClick = (event) => handleNavClick(event, HOME_SECTION_ID);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 mx-4 mt-4 rounded-3xl bg-black/50 backdrop-blur-sm sm:mx-10 sm:mt-8">
      <div className="flex h-20 items-center justify-between px-6 sm:px-10">
        {/* Logo */}
        <Link to="/" onClick={handleLogoClick} className="flex items-center gap-3">
          <img className="size-20" src="/LotusIcon.svg" alt="Logo" />
          <span className="font-bold text-blue-50 md:hidden lg:block lg:text-2xl">
            Viva Bem SPA
          </span>
        </Link>

        {/* Navegação com scroll spy */}
        <nav className="hidden items-center gap-10 md:flex">
          {NAV_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => handleNavClick(event, id)}
              className={`text-md font-semibold transition-colors text-blue-50 hover:text-blue-50 ${
                activeId === id
                  ? "text-blue-50"
                  : "text-blue-50/50"
              }`}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Ações */}
        <div className="flex items-center gap-3">
          <Link
            to="/auth/login"
            className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-blue-50 transition hover:outline-2 outline-muted md:inline-flex"
          >
            Entrar
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
            className="text-blue-50 md:hidden"
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="flex flex-col gap-1 px-6 pb-6 pt-2 sm:px-10">
          {NAV_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => handleNavClick(event, id)}
              className={`rounded-xl px-3 py-3 text-base font-semibold transition-colors ${
                activeId === id
                  ? "text-blue-50"
                  : "text-blue-50/50 hover:text-blue-50"
              }`}
            >
              {label}
            </a>
          ))}

          <div className="mt-3 flex flex-col gap-3 border-t border-blue-50/10 pt-4">

            <Button
              onPress={() => navigate("/auth/login")}
              variant="ghost"
              className="w-full bg-black/5 text-white active:bg-black/50 transition-all"
            >
              Entrar
            </Button>

            <Button
              onPress={() => navigate("/register")}
              variant="ghost"
              className="w-full bg-black/5 text-white active:bg-black/50 transition-all"
            >
              Criar minha conta
            </Button>

            {/* <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-white transition hover:opacity-90"
            >
              Cadastrar
            </Link> */}
          </div>
        </nav>
      </div>
    </header>
  );
}
