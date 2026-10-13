import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Spinner } from "@heroui/react";
import { CalendarPlus, OctagonAlert } from "lucide-react";
import { fetchMyAppointments } from "../../../api/appointments";

import SessionHistory from "./SessionHistory"

export default function SchedulingList() {
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setLoadError("");
    fetchMyAppointments()
      .then(setAppointments)
      .catch((err) => setLoadError(err.message || "Erro ao carregar agendamentos."))
      .finally(() => setIsLoading(false));
  }, []);

  // Leva pro fluxo de criação (Scheduling.jsx), sem serviço pré-selecionado.
  const handleNewAppointment = () => {
    navigate("/user/scheduling/new");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-overlay border-b border-border/50 p-5">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Agendamentos</h2>
          <span className="font-semibold">Histórico</span>
        </div>

        <Button
          size="sm"
          variant="primary"
          className="rounded-full font-semibold"
          onPress={handleNewAppointment}
        >
          <CalendarPlus size={16} />
          Novo
        </Button>
      </div>

      <div className="bg-background pt-25 px-5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <Spinner color="current" />
            <p className="text-sm font-semibold text-muted">Carregando agendamentos</p>
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center gap-2 py-16 text-danger">
            <OctagonAlert />
            <p className="text-sm font-semibold">{loadError}</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
            <p className="text-sm font-medium">Você ainda não tem agendamentos.</p>
          </div>
        ) : (
          <SessionHistory appointments={appointments} />
        )}
      </div>
    </div>
  );
}
