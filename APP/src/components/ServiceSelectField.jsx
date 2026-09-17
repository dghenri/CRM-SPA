import { Label, ListBox, Select, Spinner } from "@heroui/react";

export default function ServiceSelectField({ services, isLoading, value, onChange }) {
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
          <Select.Value />
          {isLoading ? <Spinner size="sm" /> : <Select.Indicator />}
        </Select.Trigger>
        <Select.Popover>
          <ListBox items={services}>
            {(service) => (
              <ListBox.Item id={String(service.id)} textValue={service.title}>
                <Label>{service.title}</Label>
              </ListBox.Item>
            )}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
