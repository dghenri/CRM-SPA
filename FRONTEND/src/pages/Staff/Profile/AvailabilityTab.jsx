import { useState, useEffect } from "react";
import api from "../../../api/api";
import { Button, Input, Separator, Spinner, Switch, toast } from "@heroui/react";
import { Plus, Trash2 } from "lucide-react";

// weekday segue o Date.getDay(): 0 = domingo ... 6 = sábado.
// Exibimos começando na segunda.
const DAYS = [
  { weekday: 1, label: "Segunda-feira" },
  { weekday: 2, label: "Terça-feira" },
  { weekday: 3, label: "Quarta-feira" },
  { weekday: 4, label: "Quinta-feira" },
  { weekday: 5, label: "Sexta-feira" },
  { weekday: 6, label: "Sábado" },
  { weekday: 0, label: "Domingo" },
];

const DEFAULT_INTERVAL = { startTime: "08:00", endTime: "18:00" };

// transforma a lista plana do back-end em { [weekday]: [{startTime, endTime}] }
function groupByWeekday(list) {
  const grouped = {};
  DAYS.forEach(({ weekday }) => (grouped[weekday] = []));
  (list || []).forEach(({ weekday, startTime, endTime }) => {
    if (grouped[weekday]) grouped[weekday].push({ startTime, endTime });
  });
  Object.values(grouped).forEach((intervals) =>
    intervals.sort((a, b) => a.startTime.localeCompare(b.startTime))
  );
  return grouped;
}

// devolve a mensagem de erro do primeiro problema encontrado, ou null
function validate(schedule) {
  for (const { weekday, label } of DAYS) {
    const intervals = [...schedule[weekday]].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    for (let i = 0; i < intervals.length; i++) {
      const { startTime, endTime } = intervals[i];
      if (!startTime || !endTime) return `${label}: preencha início e fim.`;
      if (endTime <= startTime) return `${label}: o fim precisa ser depois do início.`;
      if (i > 0 && startTime < intervals[i - 1].endTime) {
        return `${label}: os horários estão se sobrepondo.`;
      }
    }
  }
  return null;
}

export default function AvailabilityTab({ staffId }) {
  const [schedule, setSchedule] = useState(() => groupByWeekday([]));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;

    (async () => {
      try {
        const list = await api.get(`/staff/${staffId}/availability`);
        if (!cancelled) setSchedule(groupByWeekday(list));
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error("Não foi possível carregar a disponibilidade.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const toggleDay = (weekday, enabled) => {
    setSchedule((prev) => ({
      ...prev,
      [weekday]: enabled ? [{ ...DEFAULT_INTERVAL }] : [],
    }));
  };

  const updateInterval = (weekday, index, field, value) => {
    setSchedule((prev) => ({
      ...prev,
      [weekday]: prev[weekday].map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addInterval = (weekday) => {
    setSchedule((prev) => {
      const last = prev[weekday][prev[weekday].length - 1];
      // novo intervalo começa onde o último terminou (ex: depois do almoço);
      // o fim fica vazio pra pessoa preencher - validate() exige o preenchimento
      const next = last
        ? { startTime: last.endTime, endTime: "" }
        : { ...DEFAULT_INTERVAL };
      return { ...prev, [weekday]: [...prev[weekday], next] };
    });
  };

  const removeInterval = (weekday, index) => {
    setSchedule((prev) => ({
      ...prev,
      [weekday]: prev[weekday].filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    const error = validate(schedule);
    if (error) {
      toast.error(error);
      return;
    }

    setIsSaving(true);
    try {
      const availability = DAYS.flatMap(({ weekday }) =>
        schedule[weekday].map(({ startTime, endTime }) => ({ weekday, startTime, endTime }))
      );
      const saved = await api.put(`/staff/${staffId}/availability`, { availability });
      setSchedule(groupByWeekday(saved));
      toast.success("Disponibilidade atualizada com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6">
        <Spinner color="currentColor" className="size-6" />
        <p>Carregando disponibilidade</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-bold">Disponibilidade semanal</h2>
      <p className="text-sm text-muted">
        Defina os dias e horários em que você atende. Dias desligados ficam indisponíveis para agendamento.
      </p>
      <Separator className="mt-4" />

      {DAYS.map(({ weekday, label }) => {
        const intervals = schedule[weekday];
        const enabled = intervals.length > 0;

        return (
          <div key={weekday}>
            <div className="flex flex-col items-start justify-between gap-3 py-5 sm:flex-row sm:gap-6">
              <div className="flex items-center gap-3 sm:w-48 sm:pt-2">
                <Switch
                  aria-label={`Trabalha na ${label}`}
                  isSelected={enabled}
                  onChange={(next) => toggleDay(weekday, next)}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
                <span className="font-semibold">{label}</span>
              </div>

              <div className="flex w-full flex-1 flex-col gap-2">
                {!enabled && <span className="text-sm text-muted sm:pt-2">Indisponível</span>}

                {intervals.map((interval, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Input
                      type="time"
                      aria-label="Início"
                      value={interval.startTime}
                      onChange={(e) => updateInterval(weekday, index, "startTime", e.target.value)}
                      className="w-32 border border-border font-semibold"
                    />
                    <span className="text-muted">até</span>
                    <Input
                      type="time"
                      aria-label="Fim"
                      value={interval.endTime}
                      onChange={(e) => updateInterval(weekday, index, "endTime", e.target.value)}
                      className="w-32 border border-border font-semibold"
                    />
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label="Remover horário"
                      onPress={() => removeInterval(weekday, index)}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>
                ))}

                {enabled && (
                  <div>
                    <Button variant="ghost" size="sm" onPress={() => addInterval(weekday)}>
                      <Plus className="size-4" /> Adicionar horário
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="mt-6 flex justify-end">
        <Button
          variant="tertiary"
          onPress={handleSave}
          isDisabled={isSaving}
          className="bg-field-foreground hover:bg-field-foreground/80 text-background p-6 mt-8 fixed right-4 bottom-5 z-30 shadow-lg sm:right-8 sm:bottom-6"
        >
          {isSaving ? <><Spinner color="currentColor" /> Salvando...</> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
