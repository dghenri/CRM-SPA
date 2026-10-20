import { Label, ListBox, Select, Spinner } from "@heroui/react";

export default function ServiceSelectField({
  services,
  isLoading,
  value,
  onChange,
  isServiceAllowed = () => true,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-semibold uppercase tracking-wide text-default-500">
        Procedimento
      </Label>

      <Select
        fullWidth
        aria-label="service-select"
        placeholder={isLoading ? "Carregando..." : "Selecione um procedimento"}
        isDisabled={isLoading || services.length === 0}
        value={value != null ? String(value) : null}
        onChange={(key) => onChange(key)}
      >
        <Select.Trigger>
          {/* só o título no campo fechado: a idade mínima fica apenas na lista */}
          <Select.Value>
            {({ selectedText, isPlaceholder, defaultChildren }) =>
              isPlaceholder ? defaultChildren : selectedText
            }
          </Select.Value>
          {isLoading ? <Spinner size="sm" /> : <Select.Indicator />}
        </Select.Trigger>
        <Select.Popover>
          {/* filhos estáticos (sem `items`): o React Aria guarda em cache o resultado da
              função de renderização e não refaz quando a idade do cliente chega depois */}
          <ListBox>
            {services.map((service) => {
              const allowed = isServiceAllowed(service);
              return (
                <ListBox.Item
                  key={service.id}
                  id={String(service.id)}
                  textValue={service.title}
                  isDisabled={!allowed}
                  className="flex w-full items-center justify-between gap-3"
                >
                  <Label>{service.title}</Label>
                  {service.minAge ? (
                    <span
                      className={`shrink-0 text-xs ${allowed ? "text-default-400" : "text-danger"}`}
                    >
                      +{service.minAge} anos
                    </span>
                  ) : null}
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
