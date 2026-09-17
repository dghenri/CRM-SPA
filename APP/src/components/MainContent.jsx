import React, { useEffect } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { mainItems, usersItems, managementItems } from "../data/navigation";
import Grainient from "./Grainient";
import ThemeSwitcher from './ThemeSwitcher'
import { useAuth } from "../context/AuthContext";
import { getGreeting, getFormattedDate } from "../utils/dateGreeting";
import FullscreenButton from "../components/FullScreenButton"

import { 
  Button,
  Tooltip,
  Breadcrumbs,
  Separator,
  Alert,
  CloseButton,
  Spinner,
} from "@heroui/react";

function getShortName(name) {
  if (!name) return "";
  return name.split(" ").filter(Boolean).slice(0, 2).join(" ");
}

const MainContent = ({ open, setOpen, children }) => {
  const location = useLocation();
  const navigate = useNavigate();
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
    <main className="flex flex-1 flex-col bg-background">
      <section
        className={
          `relative flex flex-1 flex-col min-h-0 overflow-hidden max-h-full mt-2 mr-2 mb-2 border-border bg-overlay rounded-3xl ` +
          (isSchedulingRoot ? "p-0" : "p-4 border")
        }
      >

        {isDashboardRoot && (
          <Grainient
            className="absolute -m-6 inset-0 opacity-35 pointer-events-none"
            color1="#0b8c69" /* "#99c6b9" */
            color2="transparent"
            color3="transparent"
            timeSpeed={0.2}
            colorBalance={0}
            warpStrength={1}
            warpFrequency={2.6}
            warpSpeed={1.7}
            warpAmplitude={50}
            blendAngle={20}
            blendSoftness={0.05}
            rotationAmount={120}
            noiseScale={2}
            grainAmount={0.1}
            grainScale={2}
            grainAnimated={false}
            contrast={1.5}
            gamma={1}
            saturation={1}
            centerX={0.2}
            centerY={-0.3}
            zoom={0.4}
          />
        )}

        {isDashboardRoot && (
          <>
          <div className="flex justify-between items-center">
            <div className="relative z-10">
              <p className="mb-1 text-sm font-medium text-overlay-foreground/70">
                {formattedDate}
              </p>
              <h1 className="mb-4 shrink-0 text-2xl font-bold text-overlay-foreground drop-shadow-xl">
                {greeting}, {getShortName(user?.name)}!
              </h1>
            </div>

            <FullscreenButton />
          </div>
          </>
        )}

        {!isDashboardRoot && !isSchedulingRoot && (
          <header className="relative z-10 flex justify-between shrink-0">
            <Breadcrumbs className="mt-1 mb-5">
              {breadcrumbRoutes.map((route, index) => {
                const isLast =
                  index === breadcrumbRoutes.length - 1;

                return (
                  <Breadcrumbs.Item
                    key={route.to}
                    isCurrent={isLast}
                    onPress={
                      !isLast
                        ? () => navigate(route.to)
                        : undefined
                    }
                    className={
                      !isLast
                        ? "cursor-pointer"
                        : ""
                    }
                  >
                    {route.label}
                  </Breadcrumbs.Item>
                );
              })}
            </Breadcrumbs>          
          </header>
        )}

        {!isDashboardRoot && !isSchedulingRoot && <Separator className="relative z-10 mb-6 shrink-0"/>}

          <div
            className={
              "relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden" +
              // O <section> tem p-4 (exceto na Agenda, que já usa p-0), o que
              // empurra a scrollbar pra dentro, longe da borda do card. Aqui
              // a gente "estica" esse container até a borda de verdade
              // (-mr-4) e devolve o respiro só pro conteúdo (pr-4), então a
              // scrollbar fica colada na lateral em vez de flutuando no meio.
              (isSchedulingRoot ? "" : " -mr-4 pr-4")
            }
          >
            {children}
          </div>

      </section>
    </main>
  );
};

export default MainContent;
