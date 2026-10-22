import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { mainItems, usersItems, managementItems } from "../data/navigation";
import { useAuth } from "../context/AuthContext";
import { getGreeting, getFormattedDate } from "../utils/dateGreeting";
import FullscreenButton from "../components/FullScreenButton"

function getShortName(name) {
  if (!name) return "";
  return name.split(" ").filter(Boolean).slice(0, 2).join(" ");
}

const MainContent = ({ open, setOpen, children }) => {
  const location = useLocation();
  const { user } = useAuth();

  const allRoutes = [
    ...mainItems,
    ...usersItems,
    ...managementItems,
  ];

  const pathSegments = location.pathname.split("/").filter(Boolean);

  const breadcrumbRoutes = pathSegments.map((segment, index) => {
    const to = "/" + pathSegments.slice(0, index + 1).join("/");
    const match = allRoutes.find((item) => item.to === to);

    return {
      to,
      label: match?.label || segment.charAt(0).toUpperCase() + segment.slice(1),
    };
  });

  const isDashboardRoot =
    location.pathname === "/staff" ||
    location.pathname === "/staff/";

  const isSchedulingRoot =
    location.pathname === "/staff/scheduling" ||
    location.pathname === "/staff/scheduling/";

  const greeting = getGreeting();
  const { full: formattedDate } = getFormattedDate();

  useEffect(() => {
    const last = breadcrumbRoutes[breadcrumbRoutes.length - 1];
    const label = isDashboardRoot ? "Dashboard" : (last?.label || "Dashboard");
    document.title = `${label} | SPA`;
  }, [location.pathname]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <section
        className={
          `relative flex flex-1 flex-col min-h-0 overflow-hidden max-h-full mx-2 mt-2 mb-2 md:ml-0 border-border bg-overlay rounded-3xl ` +
          (isSchedulingRoot ? "p-0" : "p-3 sm:p-4 border")
        }
      >

        {isDashboardRoot && (
          <>
          <div className="flex items-center justify-between gap-3">
            <div className="relative z-10">
              <p className="mb-1 text-sm font-medium text-overlay-foreground/70">
                {formattedDate}
              </p>
              <h1 className="mb-4 shrink-0 text-xl font-bold sm:text-2xl text-overlay-foreground drop-shadow-xl">
                {greeting}, {getShortName(user?.name)}!
              </h1>
            </div>

            {/* tela cheia não faz sentido no celular */}
            <div className="hidden sm:block">
              <FullscreenButton />
            </div>
          </div>
          </>
        )}
        
          <div
            className={
              "relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden" +
              // O <section> tem p-4 (exceto na Agenda, que já usa p-0), o que
              // empurra a scrollbar pra dentro, longe da borda do card. Aqui
              // a gente "estica" esse container até a borda de verdade
              // (-mr-4) e devolve o respiro só pro conteúdo (pr-4), então a
              // scrollbar fica colada na lateral em vez de flutuando no meio.
              // max-md:pb-16 deixa espaço para o "marcador" do menu no celular
              (isSchedulingRoot ? " max-md:pb-16" : " -mr-3 pr-3 sm:-mr-4 sm:pr-4 max-md:pb-16")
            }
          >
            {children}
          </div>

      </section>
    </main>
  );
};

export default MainContent;
