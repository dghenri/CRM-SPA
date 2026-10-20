import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@heroui/react";
import { ChevronLeft } from "lucide-react";
import ThemeSwitcher from "./ThemeSwitcher";

/** Cartão central simples das telas de recuperação de senha. */
export default function AuthCard({ title, subtitle, backTo = "/auth/login", backLabel = "Voltar ao login", documentTitle, children }) {
  useEffect(() => {
    if (documentTitle) document.title = `${documentTitle} | Viva Bem SPA`;
    document.body.style.backgroundColor = "var(--background)";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [documentTitle]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md gap-6 rounded-3xl p-6 sm:p-8">
        {/* acessibilidade e navegação */}
        <div className="flex items-center justify-between">
          <Link
            to={backTo}
            className="flex items-center gap-1 rounded-md text-sm font-semibold text-field-placeholder transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ChevronLeft size={16} aria-hidden="true" /> {backLabel}
          </Link>
          <ThemeSwitcher />
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <img className="size-16" src="/LotusIcon.svg" alt="" />
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm font-medium text-field-placeholder">{subtitle}</p>}
        </div>

        {children}
      </Card>
    </main>
  );
}
