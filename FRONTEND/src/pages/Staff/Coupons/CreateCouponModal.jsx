import React from 'react';
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import {
  Modal,
  Button,
  TextField,
  Input,
  TextArea,
  Label,
  Description,
  FieldError,
  Select,
  ListBox,
  NumberField,
  DateField,
  DatePicker,
  Form,
  Separator,
  Calendar,
} from '@heroui/react';
import { TicketPercent } from 'lucide-react';

import api from '../../../api/api';

// ---------------------------------------------------------------------------
// Helpers de conversão entre DateTime (string ISO vindo do back-end/Mongo) e
// CalendarDate (o tipo que o DateField do HeroUI/React Aria usa).
// ---------------------------------------------------------------------------
function isoToCalendarDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function calendarDateToIso(calendarDate) {
  if (!calendarDate) return null;
  return calendarDate.toDate(getLocalTimeZone()).toISOString();
}

// Rótulos e explicação de cada opção de "aplicável a" (applicable_to)
const SCOPE_OPTIONS = [
  { id: 'AllServices', label: 'Todos os serviços' },
  { id: 'SpecificServices', label: 'Serviços específicos' },
  { id: 'Category', label: 'Uma categoria' },
  { id: 'FirstPurchase', label: 'Primeira sessão do cliente' },
  { id: 'SpecificCustomer', label: 'Um cliente específico' },
];

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'Percentage',
  discountValue: NaN,
  minPurchase: NaN,
  maxDiscount: NaN,
  startsAt: null,
  expiresAt: null,
  usageLimit: NaN,
  perUserLimit: 1,
  scope: 'AllServices',
  serviceIds: [],
  category: '',
  userId: null,
};

// NumberField é sempre controlado: se o campo não tem valor, usamos NaN (que o
// componente entende como "vazio") em vez de undefined. Passar undefined no
// primeiro render e um número depois é o que gera o warning de "mudou de
// uncontrolled pra controlled" no console.
function numOrEmpty(value) {
  return value === undefined || value === null || Number.isNaN(value) ? '' : value;
}

// Monta o estado inicial do formulário a partir de um cupom vindo da API
// (modo edição) ou usa os valores em branco (modo criação).
function couponToForm(coupon) {
  if (!coupon) return { ...EMPTY_FORM };

  return {
    code: coupon.code ?? '',
    description: coupon.description ?? '',
    discountType: coupon.discountType ?? 'Percentage',
    discountValue: coupon.discountValue ?? NaN,
    minPurchase: coupon.minPurchase ?? NaN,
    maxDiscount: coupon.maxDiscount ?? NaN,
    startsAt: isoToCalendarDate(coupon.startsAt),
    expiresAt: isoToCalendarDate(coupon.expiresAt),
    usageLimit: coupon.usageLimit ?? NaN,
    perUserLimit: coupon.perUserLimit ?? NaN,
    scope: coupon.scope ?? 'AllServices',
    serviceIds: coupon.serviceIds ?? [],
    category: coupon.category ?? '',
    userId: coupon.userId ?? coupon.user?.id ?? null,
  };
}

export default function CreatCuponModal({ isOpen, onOpenChange, coupon, onSaved }) {
  const isEditing = Boolean(coupon?.id);

  const [form, setForm] = React.useState(() => couponToForm(coupon));
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  // Serviços e clientes só são carregados quando realmente precisamos deles
  // (escopo "Serviços específicos" / "Cliente específico"), pra não pesar o
  // carregamento do modal à toa.
  const [services, setServices] = React.useState([]);
  const [users, setUsers] = React.useState([]);

  // Sempre que o modal abre (seja pra criar ou editar um cupom diferente),
  // reinicializamos o formulário a partir do cupom atual.
  React.useEffect(() => {
    if (isOpen) {
      setForm(couponToForm(coupon));
      setErrorMessage('');
    }
  }, [isOpen, coupon]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (form.scope === 'SpecificServices' || form.scope === 'Category') {
      api.get('/services').then(setServices).catch(() => {});
    }
    if (form.scope === 'SpecificCustomer') {
      api.get('/users').then(setUsers).catch(() => {});
    }
  }, [isOpen, form.scope]);

  const categories = React.useMemo(
    () => [...new Set(services.map((s) => s.category).filter(Boolean))],
    [services]
  );

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    if (!form.code.trim() || Number.isNaN(form.discountValue)) {
      setErrorMessage('Preencha ao menos o código e o valor do desconto.');
      return;
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: form.discountValue,
      minPurchase: numOrEmpty(form.minPurchase),
      maxDiscount: numOrEmpty(form.maxDiscount),
      startsAt: calendarDateToIso(form.startsAt),
      expiresAt: calendarDateToIso(form.expiresAt),
      usageLimit: numOrEmpty(form.usageLimit),
      perUserLimit: numOrEmpty(form.perUserLimit),
      scope: form.scope,
      serviceIds: form.scope === 'SpecificServices' ? form.serviceIds : undefined,
      category: form.scope === 'Category' ? form.category : undefined,
      userId: form.scope === 'SpecificCustomer' ? form.userId : undefined,
    };

    setIsSubmitting(true);
    try {
      const saved = isEditing
        ? await api.put(`/coupons/${coupon.id}`, payload)
        : await api.post('/coupons', payload);

      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível salvar o cupom.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="center" scroll="inside" size="cover" className="px-100">
        <Modal.Dialog>
          <Modal.Header className="flex flex-row items-center mb-8">
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <TicketPercent className="size-5" />
            </Modal.Icon>
            <Modal.Heading>{isEditing ? 'Editar cupom' : 'Criar cupom'}
            <p className="mt-1.5 text-sm leading-5 text-muted">
              {isEditing
                ? 'Altere as informações do cupom de desconto.'
                : 'Defina o código e as regras do novo cupom de desconto.'}
            </p>
            </Modal.Heading>
          </Modal.Header>

          <Form id="coupon-form" className="contents" onSubmit={handleSubmit}>
            <Modal.Body className="flex flex-col gap-4">
              {/* Código + descrição (visível pro cliente) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  className="w-full"
                  name="code"
                  isRequired
                  value={form.code}
                  onChange={(value) => updateField('code', value.toUpperCase())}
                >
                  <Label>Código</Label>
                  <Input placeholder="BEMVINDO10" className="border border-default rounded-lg" />
                  <Description>O que o cliente vai digitar.</Description>
                </TextField>

                <Select
                  className="w-full"
                  selectedKey={form.discountType}
                  onSelectionChange={(key) => updateField('discountType', key)}
                >
                  <Label>Tipo de desconto</Label>
                  <Select.Trigger className="border border-default rounded-lg">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="Percentage" textValue="Percentual (%)">
                        Percentual (%)
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="Fixed" textValue="Valor fixo (R$)">
                        Valor fixo (R$)
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <TextField
                className="w-full"
                name="description"
                value={form.description}
                onChange={(value) => updateField('description', value)}
              >
                <Label>Descrição</Label>
                <TextArea placeholder="Ex: 10% de desconto pra novos clientes" rows={2} className="border border-default rounded-lg" />
                <Description>Aparece pro cliente quando ele visualiza ou aplica o cupom.</Description>
              </TextField>

              {/* Valores do desconto */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <NumberField
                  isRequired
                  minValue={0}
                  maxValue={form.discountType === 'Percentage' ? 100 : undefined}
                  value={form.discountValue}
                  onChange={(value) => updateField('discountValue', value)}
                  formatOptions={
                    form.discountType === 'Percentage'
                      ? undefined
                      : { currency: "BRL", currencySign: "accounting", style: "currency" }
                  }
                  className="w-full"
                >
                  <Label>
                    Valor do desconto {form.discountType === 'Percentage' ? '(%)' : '(R$)'}
                  </Label>
                  <NumberField.Group className="flex w-50 h-10 items-stretch overflow-hidden rounded-lg border border-default">
                    <NumberField.DecrementButton className="flex w-10 shrink-0 items-center justify-center" />
                    <NumberField.Input className="min-w-0 flex-1 border-0 px-3 py-0 leading-none focus:outline-none" />
                    {form.discountType === 'Percentage' && (
                      <span className="flex shrink-0 items-center pr-1 text-sm font-medium text-muted">%</span>
                    )}
                    <NumberField.IncrementButton className="flex w-10 shrink-0 items-center justify-center" />
                  </NumberField.Group>
                </NumberField>

                <NumberField
                  minValue={0}
                  value={form.maxDiscount}
                  onChange={(value) => updateField('maxDiscount', value)}
                  isDisabled={form.discountType !== 'Percentage'}
                  formatOptions={{
                    currency: "BRL",
                    currencySign: "accounting",
                    style: "currency",
                  }}
                  className="w-full"
                >
                  <Label>Desconto máximo (R$)</Label>
                  <NumberField.Group className="flex w-50 h-10 items-stretch overflow-hidden rounded-lg border border-default">
                    <NumberField.DecrementButton className="flex w-10 shrink-0 items-center justify-center" />
                    <NumberField.Input className="min-w-0 flex-1 border-0 px-3 py-0 leading-none focus:outline-none" />
                    <NumberField.IncrementButton className="flex w-10 shrink-0 items-center justify-center" />
                  </NumberField.Group>
                  <Description>Opcional, só faz sentido pra percentual % .</Description>
                </NumberField>
                <NumberField
                  className="w-full"
                  minValue={0}
                  value={form.minPurchase}
                  formatOptions={{
                    currency: "BRL",
                    currencySign: "accounting",
                    style: "currency",
                  }}
                  onChange={(value) => updateField('minPurchase', value)}
                >
                  <Label>Compra mínima (R$)</Label>
                  <NumberField.Group className="flex w-50 h-10 items-stretch overflow-hidden rounded-lg border border-default">
                      <NumberField.DecrementButton className="flex w-10 shrink-0 items-center justify-center" />
                      <NumberField.Input className="min-w-0 flex-1 border-0 px-3 py-0 leading-none focus:outline-none" />
                      <NumberField.IncrementButton className="flex w-10 shrink-0 items-center justify-center" />
                    </NumberField.Group>
                  <Description>Deixe em branco se não houver valor mínimo.</Description>
                </NumberField>
              </div>

              {/* Aplicável a (applicable_to) */}
              <div className="mt-8">
                <span className="cursor-default select-none uppercase tracking-wide text-muted">Aplicabilidade</span>
                <Separator  />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select
                  className="w-full"
                  selectedKey={form.scope}
                  onSelectionChange={(key) => updateField('scope', key)}
                >
                  <Label>Aplicável a</Label>
                  <Select.Trigger className="w-fit border border-default rounded-lg">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {SCOPE_OPTIONS.map((option) => (
                        <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                          {option.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                {form.scope === 'SpecificServices' && (
                  <Select
                    className="w-full"
                    selectionMode="multiple"
                    placeholder="Selecione os serviços"
                    value={form.serviceIds}
                    onChange={(keys) => updateField('serviceIds', keys)}
                  >
                    <Label>Serviços</Label>
                    <Select.Trigger className="border border-default rounded-lg">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox selectionMode="multiple">
                        {services.map((service) => (
                          <ListBox.Item key={service.id} id={service.id} textValue={service.title}>
                            {service.title}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                )}

                {form.scope === 'Category' && (
                  <TextField className="w-full" value={form.category} onChange={(value) => updateField('category', value)}>
                    <Label>Categoria</Label>
                    <Input placeholder="Ex: massagens" list="coupon-categories" className="border border-default rounded-lg" />
                    <datalist id="coupon-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <Description>Vale pra todos os serviços dessa categoria.</Description>
                  </TextField>
                )}

                {form.scope === 'SpecificCustomer' && (
                  <Select
                    className="w-full"
                    placeholder="Selecione o cliente"
                    selectedKey={form.userId}
                    onSelectionChange={(key) => updateField('userId', key)}
                  >
                    <Label>Cliente</Label>
                    <Select.Trigger className="border border-default rounded-lg">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {users.map((user) => (
                          <ListBox.Item key={user.id} id={user.id} textValue={`${user.name} ${user.email}`}>
                            {user.name}
                            <span className="text-muted"> {user.email}</span>
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                )}
              </div>
              
              {/* Vigência */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DatePicker
                  className="w-full"
                  value={form.startsAt}
                  onChange={(value) => updateField('startsAt', value)}
                  minValue={today(getLocalTimeZone())}
                >
                  <Label>Início da validade</Label>
                  <DateField.Group fullWidth className="w-fit items-center border border-default rounded-lg">
                    <DateField.Input>
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateField.Suffix>
                      <DatePicker.Trigger>
                        <DatePicker.TriggerIndicator />
                      </DatePicker.Trigger>
                    </DateField.Suffix>
                  </DateField.Group>
                  <Description>Vazio = já começa a valer.</Description>
                  <DatePicker.Popover>
                    <Calendar aria-label="Início da validade">
                      <Calendar.Header>
                        <Calendar.YearPickerTrigger>
                          <Calendar.YearPickerTriggerHeading />
                          <Calendar.YearPickerTriggerIndicator />
                        </Calendar.YearPickerTrigger>
                        <Calendar.NavButton slot="previous" />
                        <Calendar.NavButton slot="next" />
                      </Calendar.Header>
                      <Calendar.Grid>
                        <Calendar.GridHeader>
                          {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                        </Calendar.GridHeader>
                        <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                      </Calendar.Grid>
                      <Calendar.YearPickerGrid>
                        <Calendar.YearPickerGridBody>
                          {({ year }) => <Calendar.YearPickerCell year={year} />}
                        </Calendar.YearPickerGridBody>
                      </Calendar.YearPickerGrid>
                    </Calendar>
                  </DatePicker.Popover>
                </DatePicker>

                <DatePicker
                  className="w-full"
                  value={form.expiresAt}
                  onChange={(value) => updateField('expiresAt', value)}
                  minValue={form.startsAt ?? today(getLocalTimeZone())}
                >
                  <Label>Fim da validade</Label>
                  <DateField.Group fullWidth className="w-fit items-center border border-default rounded-lg">
                    <DateField.Input>
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateField.Suffix>
                      <DatePicker.Trigger>
                        <DatePicker.TriggerIndicator />
                      </DatePicker.Trigger>
                    </DateField.Suffix>
                  </DateField.Group>
                  <Description>Vazio = não expira.</Description>
                  <DatePicker.Popover>
                    <Calendar aria-label="Fim da validade">
                      <Calendar.Header>
                        <Calendar.YearPickerTrigger>
                          <Calendar.YearPickerTriggerHeading />
                          <Calendar.YearPickerTriggerIndicator />
                        </Calendar.YearPickerTrigger>
                        <Calendar.NavButton slot="previous" />
                        <Calendar.NavButton slot="next" />
                      </Calendar.Header>
                      <Calendar.Grid>
                        <Calendar.GridHeader>
                          {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                        </Calendar.GridHeader>
                        <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                      </Calendar.Grid>
                      <Calendar.YearPickerGrid>
                        <Calendar.YearPickerGridBody>
                          {({ year }) => <Calendar.YearPickerCell year={year} />}
                        </Calendar.YearPickerGridBody>
                      </Calendar.YearPickerGrid>
                    </Calendar>
                  </DatePicker.Popover>
                </DatePicker>
              </div>

              <div className="mt-8">
                <span className="cursor-default select-none uppercase tracking-wide text-muted">Restrições</span>
                <Separator  />
              </div>

              {/* Limites de uso */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <NumberField
                  minValue={0}
                  step={1}
                  value={form.usageLimit}
                  onChange={(value) => updateField('usageLimit', value)}
                >
                  <Label>Limite total de usos</Label>
                  <NumberField.Group className="flex w-40 h-10 items-stretch overflow-hidden rounded-lg border border-default">
                    <NumberField.DecrementButton className="flex w-10 shrink-0 items-center justify-center" />
                    <NumberField.Input className="min-w-0 flex-1 border-0 px-3 py-0 leading-none focus:outline-none" />
                    <NumberField.IncrementButton className="flex w-10 shrink-0 items-center justify-center" />
                  </NumberField.Group>
                  <Description>Vazio = ilimitado.</Description>
                </NumberField>

                <NumberField
                  minValue={0}
                  step={1}
                  value={form.perUserLimit}
                  onChange={(value) => updateField('perUserLimit', value)}
                >
                  <Label>Limite por cliente</Label>
                  <NumberField.Group className="flex w-40 h-10 items-stretch overflow-hidden rounded-lg border border-default">
                    <NumberField.DecrementButton className="flex w-10 shrink-0 items-center justify-center" />
                    <NumberField.Input className="min-w-0 flex-1 border-0 px-3 py-0 leading-none focus:outline-none" />
                    <NumberField.IncrementButton className="flex w-10 shrink-0 items-center justify-center" />
                  </NumberField.Group>
                  <Description>Quantas vezes o mesmo cliente pode usar.</Description>
                </NumberField>
              </div>

              {!!errorMessage && (
                <FieldError className="block text-sm text-danger">{errorMessage}</FieldError>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button slot="close" variant="tertiary" isDisabled={isSubmitting}>
                Cancelar
              </Button>

              <Button type="submit" isPending={isSubmitting}>
                {isEditing ? 'Salvar alterações' : 'Criar cupom'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
