import { useState, useRef, useEffect } from "react";
import { Dropdown, Separator } from "@heroui/react";
import { Clock, Pencil, Copy, Trash2 } from "lucide-react";
import { SLOT_MIN, SLOT_PX, colorForAppointment, fmtTime } from "./schedulingConstants";
import AppointmentPopover from "./AppointmentPopover";

export default function AppointmentCard({
  appointment,
  displayStart,
  displayEnd,
  isGhost,
  continuesBefore = false,
  continuesAfter = false,
  onPointerDown,
  onEdit,
  onDelete,
  onDuplicate,
  onStatusChange,
  onSaveNotes,
  overlay = false,
  dragEnabled = true,
  transform,
}) {
  const [menuPos, setMenuPos] = useState(null);

  const minutesFromStart = displayStart.getHours() * 60 + displayStart.getMinutes();
  const durMin = Math.max(SLOT_MIN, (displayEnd.getTime() - displayStart.getTime()) / 60_000);
  const top = (minutesFromStart / SLOT_MIN) * SLOT_PX;
  const height = (durMin / SLOT_MIN) * SLOT_PX;
  const c = colorForAppointment(appointment); // cor vem do status

  const style = overlay
    ? {
        height,
        width: "170px",
    }
    : {
        top,
        height,
    };

  const onContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        data-appt
        onPointerDown={onPointerDown}
        onContextMenu={onContext}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
        className={
          "absolute inset-x-1 z-5 select-none overflow-hidden border-l-4 px-2 py-1 text-default-foreground shadow-sm transition-shadow " +
          (dragEnabled ? "cursor-grab active:cursor-grabbing " : "cursor-default ") +
          c.bg + " " + c.border +
          (continuesBefore ? " rounded-t-none" : " rounded-t-md") +
          (continuesAfter ? " rounded-b-none" : " rounded-b-md") +
          (isGhost ? " opacity-20" : "")
        }
        style={style}
      >
        <div className="pr-8">
          <div className="truncate text-[12px] font-semibold leading-tight">
            {continuesBefore ? "▸ " : ""}{appointment.title}
          </div>
          {appointment.clientName && (
            <div className="truncate text-[10px] opacity-90 font-medium">
              {appointment.clientName}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-90 font-semibold">
            <Clock className="size-3" />
            {fmtTime(displayStart)} – {fmtTime(displayEnd)}{continuesAfter ? " ▸" : ""}
          </div>
        </div>

        {!overlay && (
          <AppointmentPopover
            appointment={appointment}
            color={c}
            onStatusChange={(status) => onStatusChange?.(appointment.id, status)}
            onSaveNotes={(notes) => onSaveNotes?.(appointment.id, notes)}
          />
        )}
      </div>

      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      )}
    </>
  );
}

/* --------------------------- Context Menu ---------------------------- */
// Só é usado pelo AppointmentCard (clique direito num agendamento), por
// isso mora aqui em vez de num arquivo próprio.

function ContextMenu({ x, y, onClose, onEdit, onDelete, onDuplicate }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 280);
  const handleEdit = () => {
    setTimeout(() => {
      onEdit?.();
      onClose();
    }, 0);
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="fixed z-9999 w-58 overflow-hidden rounded-2xl border bg-overlay shadow-xl p-2"
      style={{ left, top }}
    >
      <Dropdown.Menu aria-label="Menu">
        
        <Dropdown.Item
          variant="ghost"
          className="flex w-full gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold"
          onClick={handleEdit}
        >
          <Pencil className="size-4" /> Editar
        </Dropdown.Item>

        <Dropdown.Item
          variant="ghost"
          className="flex w-full gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold mt-1"
          onClick={() => setTimeout(() => { onDuplicate?.(); onClose(); }, 0)}
        >
          <Copy className="size-4" /> Duplicar
        </Dropdown.Item>

        <Separator className="mt-2" />

        <Dropdown.Item
          variant="ghost"
          className="flex w-full items-center gap-2 rounded-xl text-danger font-semibold text-sm px-2 py-1.5 mt-3"
          onClick={() => setTimeout(() => { onDelete?.(); onClose(); }, 0)}
        >
          <Trash2 className="size-4" /> Deletar
        </Dropdown.Item>
      </Dropdown.Menu>
    </div>
  );
}
