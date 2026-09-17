import { Check } from "lucide-react";

/**
 * Stepper simples e reutilizável.
 * HeroUI v3.2.4 não possui um componente de Steps/Stepper nativo,
 * então este componente segue a linguagem visual do design system
 * (cores accent/success, Chip-like, tipografia consistente).
 *
 * @param {string[]} steps - rótulos de cada etapa, ex: ["Data e horário", "Confirmação"]
 * @param {number} currentStep - etapa atual, começando em 1
 */
export default function Steps({ steps, currentStep }) {
  return (
    <div className="flex items-center px-5 py-4">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;
        const isLast = stepNumber === steps.length;

        return (
          <div key={label} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isCompleted
                    ? "bg-success text-white"
                    : isActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-default text-default-foreground"
                }`}
              >
                {isCompleted ? <Check size={16} /> : stepNumber}
              </div>
              <span
                className={`whitespace-nowrap text-xs font-medium ${
                  isActive || isCompleted ? "text-foreground" : "text-muted"
                }`}
              >
                {label}
              </span>
            </div>

            {!isLast && (
              <div
                className={`-mx-6 h-0.5 flex-1 rounded-full transition-colors mb-6 ${
                  isCompleted ? "bg-success" : "bg-default"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
