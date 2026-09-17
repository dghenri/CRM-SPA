import { useEffect, useRef, useState } from "react";
import { useAppointments } from "../Scheduling/Scheduling";
import { useAuth } from "../../../context/AuthContext";
import Sound from "../../../assets/Sounds/notification-6.mp3";

// Fica montado na raiz de /staff (StaffLayout), então o aviso sonoro de
// agendamento novo funciona em qualquer página do staff — não só na Home.
export default function SoundProvider({ children }) {
  const appointments = useAppointments();
  const { user } = useAuth();
  const audioRef = useRef(null);
  const knownIdsRef = useRef(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // true até carregar - bate com DEFAULT_STAFF_SETTINGS.soundEnabled no
  // server.js. Enquanto for false, o som fica todo desligado: não cria o
  // áudio, não tenta destravar e não mostra o aviso de "clique aqui".
  const soundEnabled = user?.settings?.soundEnabled !== false;

  useEffect(() => {
    if (!soundEnabled) return;

    audioRef.current = new Audio(Sound);

    const unlockAudio = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          setIsUnlocked(true);
          document.removeEventListener("pointerdown", unlockAudio);
          document.removeEventListener("keydown", unlockAudio);
          
        })
        .catch((err) => {
          console.warn("[SoundProvider] ainda bloqueado:", err?.name, err?.message);
        });
    };

    // Tenta destravar assim que monta, sem esperar um clique novo - cobre
    // o caso de já ter havido uma interação real antes (ex: clique no
    // botão de login), já que é a mesma aba/documento.
    unlockAudio();
    // Se a tentativa acima falhar, esses listeners pegam a próxima
    // interação de verdade que acontecer dentro do staff.
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    return () => {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) return;

    const currentIds = new Set(appointments.map((a) => a.id));

    // `appointments` começa como [] e só recebe os dados reais depois do
    // primeiro fetch terminar — sem essa checagem, esse [] inicial virava a
    // "base" de comparação e TODO agendamento já existente parecia "novo"
    // assim que os dados chegavam, tocando o som toda vez que o app montava.
    if (appointments.length === 0 && knownIdsRef.current === null) {
      return;
    }

    // primeira carga real (com dados) desta sessão do app: só registra a
    // base, sem tocar som — do contrário todo agendamento já existente
    // soaria como "novo" no primeiro carregamento.
    if (knownIdsRef.current === null) {
      knownIdsRef.current = currentIds;
      return;
    }

    // Só toca o som pra agendamentos novos que ainda estão "Aguardando
    // confirmação" (Scheduled) — é o caso que realmente precisa de ação do
    // funcionário. O back-end já cria agendamentos de cliente com status
    // "Scheduled" por padrão (default do schema.prisma, confirmado em
    // server.js); um agendamento criado pela própria equipe, já confirmado,
    // não precisa gerar aviso sonoro.
    const hasNewAppointmentNeedingConfirmation = appointments.some(
      (a) => !knownIdsRef.current.has(a.id) && a.status === "Scheduled"
    );
    if (hasNewAppointmentNeedingConfirmation) {
      audioRef.current?.play().catch((err) =>
        console.warn("[SoundProvider] play() do aviso falhou:", err?.name, err?.message)
      );
    }

    knownIdsRef.current = currentIds;
  }, [appointments, soundEnabled]);

  return (
    <>
      {children}
      {soundEnabled && !isUnlocked && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-9999 flex justify-center px-4">
          <div className="pointer-events-none flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg">
            🔔 Clique em qualquer lugar da tela para ativar o som de novos agendamentos
          </div>
        </div>
      )}
    </>
  );
}
