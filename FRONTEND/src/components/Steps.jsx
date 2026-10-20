import { Check } from "lucide-react";

/**
 * Stepper simples e reutilizável.
 * HeroUI v3.2.4 não possui um componente de Steps/Stepper nativo,
 * então este componente segue a linguagem visual do design system
 * (cores accent/success, Chip-like, tipografia consistente).
 *
 * @param {string[]} steps - rótulos de cada etapa, ex: ["Procedimento", "Data e horário", "Pagamento", "Confirmação"]
 * @param {number} currentStep - etapa atual, começando em 1
 * @param {(stepNumber: number) => void} [onStepClick] - se informado, a numeração vira clicável
 * @param {(stepNumber: number) => boolean} [canGoToStep] - define quais etapas podem ser abertas (as demais ficam desabilitadas)
 */
export default function Steps({ steps, currentStep, onStepClick, canGoToStep }) {
  return (
    <div className="flex items-start px-5 py-4">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;
        const isLast = stepNumber === steps.length;
        const isInteractive = Boolean(onStepClick);
        const isReachable = !canGoToStep || canGoToStep(stepNumber);

        return (
          // células de largura igual: o centro do círculo fica sempre em 50% da célula,
          // então a linha pode ser posicionada com folga fixa, não importa o tamanho do rótulo
          <div key={label} className="relative flex min-w-0 flex-1 justify-center">
            <button
              type="button"
              disabled={!isInteractive || !isReachable || isActive}
              onClick={() => onStepClick?.(stepNumber)}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Etapa ${stepNumber}: ${label}`}
              className={`flex max-w-full flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isInteractive && isReachable && !isActive ? "cursor-pointer" : "cursor-default"
              } ${isInteractive && !isReachable && !isCompleted ? "opacity-50" : ""}`}
            >
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
                className={`text-center text-xs font-medium leading-tight ${
                  isActive || isCompleted ? "text-foreground" : "text-muted"
                }`}
              >
                {label}
              </span>
            </button>

            {!isLast && (
              <div
                aria-hidden="true"
                // começa a 6px do círculo atual (16px = raio) e termina a 6px do próximo
                style={{ left: "calc(50% + 22px)", width: "calc(100% - 44px)" }}
                className={`absolute top-[15px] h-0.5 rounded-full transition-colors ${
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
