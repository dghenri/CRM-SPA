import React, { useEffect, useState } from 'react'
import ThemeSwitcher from "../../../components/ThemeSwitcher"
import { Separator, Switch, toast } from '@heroui/react';
import api from "../../../api/api";
import { useAuth } from "../../../context/AuthContext";

export default function Settings() {
  const { user, updateUser } = useAuth();
  // false até o usuário logado carregar - bate com o default do back-end
  // (DEFAULT_STAFF_SETTINGS.dragAppointments em server.js)
  const [dragEnabled, setDragEnabled] = useState(false);
  // true por padrão - preferível já vir ativado e a pessoa desativar se
  // quiser, do que a notificação sonora ficar "escondida" atrás de um
  // switch desligado sem ninguém saber que ela existe.
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tabletMode, setTabletMode] = useState(false);
  // true por padrão - bate com o default do próprio LiveClock
  // (withSeconds = true quando a preferência ainda não foi carregada)
  const [showClockSeconds, setShowClockSeconds] = useState(true);

  useEffect(() => {
    if (typeof user?.settings?.dragAppointments === "boolean") {
      setDragEnabled(user.settings.dragAppointments);
    }
    if (typeof user?.settings?.soundEnabled === "boolean") {
      setSoundEnabled(user.settings.soundEnabled);
    }
    if (typeof user?.settings?.tabletMode === "boolean") {
      setTabletMode(user.settings.tabletMode);
    }
    if (typeof user?.settings?.showClockSeconds === "boolean") {
      setShowClockSeconds(user.settings.showClockSeconds);
    }
  }, [user]);

  const handleToggleDrag = async (next) => {
    setDragEnabled(next);
    if (!user?.id) return;
    try {
      const updated = await api.put(`/staff/${user.id}`, { settings: { dragAppointments: next } });
      updateUser(updated);
    } catch (err) {
      console.error("Falha ao salvar preferência de arrastar agendamentos:", err);
      setDragEnabled(!next);
      toast(err.message || "Erro ao salvar preferência", { variant: "danger" });
    }
  };

  const handleToggleSound = async (next) => {
    setSoundEnabled(next);
    if (!user?.id) return;
    try {
      const updated = await api.put(`/staff/${user.id}`, { settings: { soundEnabled: next } });
      updateUser(updated);
    } catch (err) {
      console.error("Falha ao salvar preferência de som:", err);
      setSoundEnabled(!next);
      toast(err.message || "Erro ao salvar preferência", { variant: "danger" });
    }
  };

  const handleToggleTablet = async (next) => {
    setTabletMode(next);
    if (!user?.id) return;
    try {
      const updated = await api.put(`/staff/${user.id}`, { settings: { tabletMode: next } });
      updateUser(updated);
    } catch (err) {
      console.error("Falha ao salvar preferência de modo tablet:", err);
      setTabletMode(!next);
      toast(err.message || "Erro ao salvar preferência", { variant: "danger" });
    }
  };

  const handleToggleClockSeconds = async (next) => {
    setShowClockSeconds(next);
    if (!user?.id) return;
    try {
      const updated = await api.put(`/staff/${user.id}`, { settings: { showClockSeconds: next } });
      updateUser(updated);
    } catch (err) {
      console.error("Falha ao salvar preferência do relógio:", err);
      setShowClockSeconds(!next);
      toast(err.message || "Erro ao salvar preferência", { variant: "danger" });
    }
  };

  return (
    <div className="px-1 pt-2 sm:px-6 sm:pt-6 md:px-20 xl:px-50">
      <div>
        <div className="flex items-center justify-between gap-4 sm:pr-10">
          <div>
            <h1 className="font-bold">Arrastar agendamentos</h1>
            <span className="text-sm text-muted">Clique e arraste agendamentos para alterar dia e hora</span>
          </div>

          <Switch isSelected={dragEnabled} onChange={handleToggleDrag}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        <Separator className="my-4 sm:my-6" />
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 sm:pr-10">
          <div>
            <h1 className="font-bold">Tema</h1>
            <span className="text-sm text-muted">Escolha o tema que melhor lhe agrada</span>
          </div>

          <ThemeSwitcher />
        </div>
        <Separator className="my-4 sm:my-6" />
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 sm:pr-10">
          <div>
            <h1 className="font-bold">Permitir notificações</h1>
            <span className="text-sm text-muted">Receba alerta de novos agendamentos</span>
          </div>

          <Switch isSelected={soundEnabled} onChange={handleToggleSound}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        <Separator className="my-4 sm:my-6" />
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 sm:pr-10">
          <div>
            <h1 className="font-bold">Modo tablet</h1>
            <span className="text-sm text-muted">Amplie a interface para melhorar a navegação</span>
          </div>

          <Switch isSelected={tabletMode} onChange={handleToggleTablet}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        <Separator className="my-4 sm:my-6" />
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 sm:pr-10">
          <div>
            <h1 className="font-bold">Mostrar segundos no relógio</h1>
            <span className="text-sm text-muted">Exibe os segundos, menores, ao lado da hora no relógio digital</span>
          </div>

          <Switch isSelected={showClockSeconds} onChange={handleToggleClockSeconds}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        <Separator className="my-4 sm:my-6" />
      </div>
    </div>
  )
}
