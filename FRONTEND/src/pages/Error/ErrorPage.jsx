import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function ErrorPage() {
  useEffect(() => {
    document.title = "404 | Not found";
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold">404</h1>

      <p className="text-default-500">
        Página não encontrada
      </p>

      <Link
        to="/"
        className="rounded-lg bg-accent px-4 py-2 text-white"
      >
        Voltar para o início
      </Link>
    </div>
  );
}

const ErrorPageDash = () => {
  useEffect(() => {
    document.title = "404 | Not found";
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold">404</h1>

      <p className="text-default-500">
        Página não encontrada
      </p>

      <Link
        to="/dashboard"
        className="rounded-lg bg-accent px-4 py-2 text-white"
      >
        Voltar para o início
      </Link>
    </div>
  );
}