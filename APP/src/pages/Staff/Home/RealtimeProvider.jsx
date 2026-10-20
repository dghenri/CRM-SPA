import { useEffect } from "react";
import { notifyAppointmentsChanged } from "../Scheduling/Scheduling";
import { subscribeRealtime } from "../../../realtime/socket";

// Fica montado na raiz de /staff (StaffLayout). Ouve os avisos do servidor pelo
// socket compartilhado (src/realtime/socket.js, que cuida de reconexão e heartbeat)
// e repassa "appointments-changed" para a Agenda e para o useAppointments().
// Os polls espaçados dessas telas continuam como rede de segurança.
export default function RealtimeProvider({ children }) {
  useEffect(() => subscribeRealtime("appointments-changed", notifyAppointmentsChanged), []);
  return children;
}
