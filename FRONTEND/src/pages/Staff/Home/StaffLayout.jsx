import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from '../../../components/Sidebar';
import MainContent from '../../../components/MainContent';
import { useAuth } from '../../../context/AuthContext';
import { Spinner } from '@heroui/react';
import ComingSoon from "../../../components/ComingSoon"
import SoundProvider from "./SoundProvider"
import RealtimeProvider from "./RealtimeProvider"
import { AppointmentsProvider } from "../Scheduling/Scheduling"

export default function StaffLayout() {
  const [open, setOpen] = useState(true);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login", { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center gap-2">
        <Spinner color="current"/>
        <p className="font-semibold">Carregando</p>
      </div>
    );
  }

  const tabletMode = user?.settings?.tabletMode === true;

  return (
    <AppointmentsProvider>
      <RealtimeProvider>
        <SoundProvider>
          <div className={tabletMode ? "staff-tablet-mode" : undefined}>
            {/* <div className="fixed inset-0 z-9999 md:hidden">
              <ComingSoon className="h-full w-full" />
            </div> */}
            <div className="flex h-screen"> {/* className="hidden md:flex h-screen" */}
              <Sidebar
                open={open}
                setOpen={setOpen}
              />

              <MainContent className="flex-1 overflow-auto">
                <Outlet />
              </MainContent>
            </div>
          </div>
        </SoundProvider>
      </RealtimeProvider>
    </AppointmentsProvider>
  );
}