import { Button, Calendar, Chip, Spinner, Separator } from "@heroui/react";
import { Clock, Banknote, OctagonAlert, Ban, KeyRound, Hash, } from "lucide-react";
import ServiceSelectField from "./ServiceSelectField";

function formatPrice(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Borda ondulada ("página rasgada"), para arrematar o topo/rodapé de um cartão.
 * A cor de fundo passada em `className` (ex.: "bg-default") deve ser a MESMA
 * do cartão ao qual ela encosta — é o recorte por transparência que revela o
 * fundo por trás e cria o efeito serrilhado.
 *
 * A curva é desenhada uma única vez (como se fosse a borda inferior, com as
 * ondas "pendurando" para baixo) e a máscara é sempre amostrada a partir da
 * base do tile — por isso ela nunca fica cortada/reta. Para o topo, o mesmo
 * desenho é usado espelhado verticalmente (scaleY(-1)).
 */
function ZigzagEdge({
  position = "top",
  waveWidth = 27,
  waveHeight = 15,
  invert = true,
  className = "",
}) {
  const half = waveHeight / 2;
  const zigzag = `M0,${half} L${waveWidth / 2},0 L${waveWidth},${half}`;
  const closing = invert
    ? `L${waveWidth},0 L0,0 Z`
    : `L${waveWidth},${waveHeight} L0,${waveHeight} Z`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${waveWidth}' height='${waveHeight}'><path d='${zigzag} ${closing}' fill='#000'/></svg>`;
  const maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return (
    <div
      aria-hidden="true"
      className={`w-full shrink-0 ${className}`}
      style={{
        height: waveHeight,
        maskImage,
        WebkitMaskImage: maskImage,
        maskSize: `${waveWidth}px ${waveHeight}px`,
        WebkitMaskSize: `${waveWidth}px ${waveHeight}px`,
        maskPosition: "bottom left",
        WebkitMaskPosition: "bottom left",
        maskRepeat: "repeat-x",
        WebkitMaskRepeat: "repeat-x",
        transform: position === "top" ? "scaleY(-1)" : undefined,
      }}
    />
  );
}

/** Passo 1: escolher o procedimento. */
export function BookingStepOne({ flow }) {
  const {
    services,
    isLoadingServices,
    servicesError,
    selectedServiceId,
    selectedService,
    handleSelectService,
  } = flow;

  return (
    <div className="flex flex-col gap-6">
      <ServiceSelectField
        services={services}
        isLoading={isLoadingServices}
        value={selectedServiceId}
        onChange={handleSelectService}
      />

      {servicesError && (
        <div className="flex items-center gap-2 text-danger">
          <OctagonAlert size={16} />
          <p className="text-sm font-medium">{servicesError}</p>
        </div>
      )}

      {selectedService && (
        <div className="flex flex-col">
          <div className="flex items-center gap-3 bg-default rounded-2xl p-3">
            <img
              src={selectedService.image}
              alt={selectedService.title}
              className="size-14 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-serif text-base font-bold text-foreground t">
                {selectedService.title}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex items-center text-sm font-semibold gap-1">
                  <Banknote size={13} className="text-success-hover" />
                  {formatPrice(selectedService.price)}
                </span>
                {/* <Chip size="sm" variant="soft" color="success" className="font-semibold">
                  <Banknote size={12} />
                  {formatPrice(selectedService.price)}
                </Chip> */}
                <Chip size="sm" variant="soft" color="accent" className="font-semibold">
                  <Clock size={12} />
                  {selectedService.duration} min
                </Chip>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Passo 2: escolher data e horário. */
export function BookingStepTwo({ flow }) {
  const {
    selectedService,
    selectedDate,
    setSelectedDate,
    selectedSlot,
    setSelectedSlot,
    timeSlots,
    isLoadingSlots,
    slotsError,
    minDate,
    formattedDate,
  } = flow;

  if (!selectedService) return null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 bg-default rounded-2xl p-3">
        <img
          src={selectedService.image}
          alt={selectedService.title}
          className="size-10 shrink-0 rounded-xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-sm font-bold text-foreground">
            {selectedService.title}
          </h3>
        </div>
        <Chip size="sm" variant="soft" color="accent" className="font-semibold">
          <Clock size={12} />
          {selectedService.duration} min
        </Chip>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-default-500">
        Escolha a data
      </h3>

      <div className="mt-3 flex justify-center">
        <Calendar
          aria-label="Escolha a data do agendamento"
          minValue={minDate}
          value={selectedDate}
          onChange={setSelectedDate}
          className="w-full max-w-sm"
        >
          <Calendar.Header className="mb-6 flex items-center justify-between">
            <Calendar.NavButton
              slot="previous"
              className="flex size-12 items-center justify-center rounded-full text-black bg-default"
            />
            <Calendar.Heading className="flex-1 text-center text-xl font-bold capitalize" />
            <Calendar.NavButton
              slot="next"
              className="flex size-12 items-center justify-center rounded-full text-black bg-default"
            />
          </Calendar.Header>
          <Calendar.Grid className="w-full border-spacing-1">
            <Calendar.GridHeader>
              {(day) => (
                <Calendar.HeaderCell className="pb-2 text-sm font-semibold text-muted">
                  {day}
                </Calendar.HeaderCell>
              )}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(date) => (
                <Calendar.Cell
                  date={date}
                  className="size-12 rounded-full text-base font-semibold
                    data-[selected]:bg-accent data-[selected]:text-white
                    data-[today]:ring-2 data-[today]:ring-accent
                    data-[outside-month]:text-muted
                    data-[disabled]:text-default-300
                    data-[hovered]:bg-default"
                />
              )}
            </Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </div>

      {selectedDate && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-default-500">
            Horários em {formattedDate}
          </h3>

          {isLoadingSlots ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Spinner size="sm" color="current" />
              <p className="text-sm font-medium text-muted">Verificando disponibilidade</p>
            </div>
          ) : slotsError ? (
            <div className="flex items-center gap-2 py-4 text-danger">
              <OctagonAlert size={16} />
              <p className="text-sm font-medium">{slotsError}</p>
            </div>
          ) : timeSlots.every((slot) => !slot.isAvailable) ? (
            <div className="flex items-center gap-2 py-4 text-muted">
              <Ban size={16} />
              <p className="text-sm font-medium">
                Nenhum horário disponível nesse dia. Tente outra data.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-4 place-items-center">
              {timeSlots.map((slot) => (
                <Button
                  key={slot.label}
                  variant={selectedSlot?.label === slot.label ? "primary" : "outline"}
                  isDisabled={!slot.isAvailable}
                  className="w-full h-13 justify-center rounded-lg font-semibold"
                  onPress={() => setSelectedSlot(slot)}
                >
                  {slot.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Passo 3: resumo e confirmação. */
export function BookingStepThree({ flow }) {
  const { selectedService, formattedDate, selectedSlot, confirmedAppointment, bookingCode } = flow;

  if (!selectedService) return null;

  const displayCode = confirmedAppointment?.code ?? bookingCode;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <ZigzagEdge position="top" className="bg-overlay" />
        <div className="flex flex-col gap-3 bg-overlay p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide">
              Resumo do agendamento
            </h3>
            {displayCode && (
              <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold tracking-[0.2em] text-accent">
                #{displayCode}
              </span>
            )}
          </div>
          <Separator className="h-0 border-t-2 border-dotted border-default-400 bg-transparent" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Procedimento</span>
            <span className="text-sm font-semibold text-foreground">{selectedService.title}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Data</span>
            <span className="text-sm font-semibold capitalize text-foreground">{formattedDate}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Horário</span>
            <span className="text-sm font-semibold text-foreground">{selectedSlot?.label}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Duração</span>
            <span className="text-sm font-semibold text-foreground">
              {selectedService.duration} min
            </span>
          </div>
          <Separator className="h-0 border-t-2 border-dotted border-default-400 bg-transparent" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Valor</span>
            <span className="text-base font-bold text-foreground">
              {formatPrice(selectedService.price)}
            </span>
          </div>
        </div>
        <ZigzagEdge position="bottom" className="bg-overlay" />
      </div>

      <p className="text-xs leading-5 text-muted">
        O horário fica reservado imediatamente, mas a equipe ainda pode revisar o agendamento.
      </p>
    </div>
  );
}
