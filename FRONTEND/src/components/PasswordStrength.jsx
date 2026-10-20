import { Check, CircleAlert, X } from "lucide-react";
import { evaluatePassword } from "../utils/passwordPolicy";

// classes escritas por extenso para o Tailwind enxergá-las
const LEVELS = {
  weak: { label: "fraca", text: "text-danger", bar: "bg-danger" },
  medium: { label: "média", text: "text-warning", bar: "bg-warning" },
  strong: { label: "forte", text: "text-success", bar: "bg-success" },
};

/** Barra de força + checklist dos requisitos, atualizados a cada tecla. */
export default function PasswordStrength({ password, name, email }) {
  if (!password) return null;

  const { results, passed, ratio, level } = evaluatePassword(password, { name, email });
  const style = LEVELS[level];

  return (
    <div className="mt-3 space-y-3" aria-live="polite">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-default"
        role="progressbar"
        aria-label="Força da senha"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div className={`h-full rounded-full transition-all duration-300 ${style.bar}`} style={{ width: `${Math.max(8, ratio * 100)}%` }} />
      </div>

      <p className={`flex items-center gap-2 text-sm font-semibold ${style.text}`}>
        {passed ? <Check className="size-4" /> : <CircleAlert className="size-4" />}
        Força da senha: {style.label}
      </p>

      <ul className="space-y-1.5">
        {results.map((rule) => (
          <li key={rule.id} className={`flex items-center gap-2 text-sm font-medium ${rule.ok ? "text-foreground" : "text-danger"}`}>
            {rule.ok ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
            <span>{rule.label}</span>
            <span className="sr-only">{rule.ok ? "(atendido)" : "(pendente)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
