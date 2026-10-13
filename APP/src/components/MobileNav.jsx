import { Button } from "@heroui/react";
import { ArrowLeft } from "lucide-react";

// -----------------------------------------------------------------------
// Navbar mobile fixa no topo.
//
// Componente genérico: só cuida do "chrome" fixo (voltar + título).
// Ações específicas de uma tela — como favoritar/compartilhar na página
// de detalhes do serviço — NÃO devem morar aqui. Elas ficam dentro da
// própria página, soltas no fluxo normal (rolam com o conteúdo), e não
// nesse componente fixo. Se precisar de algo à direita que sirva pra
// várias telas (ex: sino de notificações), use `rightSlot`.
//
// Props:
// - title: texto central (opcional).
// - onBack: se passado, mostra o botão de voltar fixo à esquerda.
// - leftSlot: conteúdo livre à esquerda, usado só quando `onBack` não
//   é passado (ex: um menu hambúrguer na home).
// - rightSlot: conteúdo livre à direita (opcional).
//
// Uso:
//   <MobileNav onBack={() => navigate(-1)} title="Massagem Relaxante" />
//   <MobileNav leftSlot={<Logo />} rightSlot={<NotificationsButton />} />
// -----------------------------------------------------------------------
export default function MobileNav({ title, onBack, leftSlot, rightSlot }) {
  return (

    <header
      dir="ltr"
      className="fixed inset-x-0 top-0 z-30 h-17 grid grid-cols-[minmax(2.5rem,auto)_1fr_minmax(2.5rem,auto)] items-center gap-2 bg-overlay/30 backdrop-blur-lg drop-shadow-md px-3"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="col-start-1 flex items-center justify-start">
        {onBack ? (
          <Button
            isIconOnly
            size="lg"
            variant="ghost"
            aria-label="Voltar"
            className="text-default-foreground border-0"
            onPress={onBack}
          >
            <ArrowLeft className="size-7" />
          </Button>
        ) : (
          leftSlot
        )}
      </div>

      <h1 className="col-start-2 line-clamp-1 text-center text-xl font-bold drop-shadow-4xl text-default-foreground">
        {title}
      </h1>

      <div className="col-start-3 flex items-center justify-end gap-2">{rightSlot}</div>
    </header>
  );
}
