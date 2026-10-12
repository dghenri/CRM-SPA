import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Calendar,
  Card,
  Checkbox,
  CheckboxGroup,
  Chip,
  DateField,
  DatePicker,
  Description,
  EmptyState,
  I18nProvider,
  Input,
  Kbd,
  Label,
  ListBox,
  Modal,
  Select,
  Switch,
  Table,
  Tabs,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { Inbox, Plus, Trash2 } from 'lucide-react';

/* ---------------------------------------------------------------------------
 * ATENÇÃO: este bloco é o único ponto que depende do resto do seu front.
 * Troque pelo cliente de API / auth que você já usa (me envie esses arquivos
 * que eu adapto). Hoje assume: token JWT em localStorage("token") e a API em
 * VITE_API_URL (padrão http://localhost:3000).
 * ------------------------------------------------------------------------- */
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const getToken = () => localStorage.getItem("token");

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Erro inesperado.");
  return data;
}

/* ------------------------------ helpers ---------------------------------- */
const UNIT_LABEL = { Un: "un", Ml: "ml", G: "g" };
const ROLE_LABEL = { MajorAdmin: "Gerente", Farmaceutica: "Farmacêutica", Massoterapeuta: "Massoterapeuta" };
const TYPE_LABEL = {
  Purchase: "Entrada",
  Loss: "Perda",
  Adjustment: "Ajuste",
  Consumption: "Consumo",
  Return: "Estorno",
};
const STATUS_META = {
  Pending: { label: "Pendente", color: "warning" },
  Approved: { label: "Aprovada", color: "success" },
  Rejected: { label: "Negada", color: "danger" },
  Cancelled: { label: "Cancelada", color: "default" },
};

const fmtNum = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtQty = (n, unit) => `${fmtNum(n)} ${UNIT_LABEL[unit] ?? ""}`.trim();
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function describeItem(type, item) {
  if (type === "Purchase") {
    const label = item.purchaseUnitLabel || "embalagem";
    return `${fmtNum(item.packages)} ${label}(s) de ${item.productName} (${fmtQty(item.quantity, item.unit)})`;
  }
  const sign = type === "Adjustment" && item.quantity > 0 ? "+" : "";
  return `${sign}${fmtQty(item.quantity, item.unit)} de ${item.productName}`;
}

function describeRequest(r) {
  const who = `${r.requestedBy?.name ?? "—"} (${ROLE_LABEL[r.requestedBy?.role] ?? "—"})`;
  const verb = { Purchase: "adicionar ao estoque", Loss: "registrar perda de", Adjustment: "ajustar o estoque de" }[r.type];
  return `${who} quer ${verb}:`;
}

/* ------------------------------ atalhos de teclado ----------------------- */
// Dica visual de tecla. Some em telas pequenas (celular não tem Esc/Enter).
// - `keyValue`: tecla que o HeroUI desenha como símbolo (ex: "enter" => ↵,
//   "escape" => ⎋), com o nome acessível ("Enter") no title.
// - sem `keyValue`: mostra o texto de `children` (ex: "Esc").
// - `onFilled`: use dentro de botão colorido (primário/danger), onde o cinza
//   padrão do Kbd perde contraste.
function KeyHint({ keyValue, children, onFilled = false }) {
  return (
    <Kbd
      variant="light"
      className={`ml-1 hidden sm:inline-flex ${onFilled ? "bg-white/25 text-white **:text-white" : ""}`}
    >
      {keyValue ? <Kbd.Abbr keyValue={keyValue} /> : <Kbd.Content>{children}</Kbd.Content>}
    </Kbd>
  );
}

// Enter confirma o modal (o Esc o React Aria já trata sozinho). Regras:
// - Shift+Enter não confirma (quebra linha no campo de texto longo).
// - Só vale para teclas pressionadas DENTRO do próprio diálogo: os popovers do
//   Select e do calendário renderizam em portal, mas o React repassa o evento
//   pela árvore, então checamos o diálogo mais próximo do alvo.
// - Enter em botão/link/select mantém a função própria deles (clicar, abrir).
// - Ignora Enter de composição (IME) e enquanto está salvando.
function confirmOnEnter(onConfirm, isDisabled) {
  return (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.defaultPrevented || e.nativeEvent.isComposing) return;
    const dialogSelector = '[role="dialog"], [role="alertdialog"]';
    if (e.target.closest(dialogSelector) !== e.currentTarget.closest(dialogSelector)) return;
    if (e.target.closest('button, a, [role="button"], [role="combobox"], [role="listbox"]')) return;
    if (isDisabled) return;
    e.preventDefault();
    onConfirm();
  };
}

/* ------------------------------ campos ----------------------------------- */
function TextInput({ label, value, onChange, type = "text", placeholder, description, isRequired, min, step }) {
  return (
    <TextField fullWidth value={value} onChange={onChange} isRequired={isRequired}>
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} min={min} step={step} className="border border-border" />
      {description && <Description>{description}</Description>}
    </TextField>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "Selecione", isDisabled }) {
  return (
    <Select
      fullWidth
      placeholder={placeholder}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      isDisabled={isDisabled}
    >
      <Label>{label}</Label>
      <Select.Trigger className="border border-border">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="rounded-2xl">
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

// Seletor de data do HeroUI. Recebe/devolve string "YYYY-MM-DD" (ou "" se vazio),
// o mesmo formato do <input type="date">, então o resto do código não muda.
function DateInput({ label, value, onChange, isRequired, description }) {
  const dateValue = useMemo(() => {
    try {
      return value ? parseDate(value) : null;
    } catch {
      return null;
    }
  }, [value]);

  return (
    <I18nProvider locale="pt-BR">
      <DatePicker
        className="w-full"
        value={dateValue}
        onChange={(d) => onChange(d ? d.toString() : "")}
        isRequired={isRequired}
      >
        <Label>{label}</Label>
        <DateField.Group fullWidth className="border border-border">
          <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        {description && <Description>{description}</Description>}
        <DatePicker.Popover>
          <Calendar aria-label={label}>
            <Calendar.Header>
              <Calendar.Heading />
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}

/* ------------------------------ modal: produto --------------------------- */
const EMPTY_PRODUCT = {
  name: "",
  sku: "",
  category: "",
  unit: "Un",
  purchaseUnitLabel: "",
  purchaseUnitSize: "1",
  minStock: "0",
  trackOpening: false,
  shelfLifeAfterOpenHours: "",
  allowedRoles: [],
  active: true,
};

function ProductModal({ product, onClose, onSaved }) {
  const isEdit = !!product?.id;
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    setError("");
    setForm(
      isEdit
        ? {
            ...EMPTY_PRODUCT,
            ...product,
            sku: product.sku ?? "",
            category: product.category ?? "",
            purchaseUnitLabel: product.purchaseUnitLabel ?? "",
            purchaseUnitSize: String(product.purchaseUnitSize ?? 1),
            minStock: String(product.minStock ?? 0),
            shelfLifeAfterOpenHours: product.shelfLifeAfterOpenHours ? String(product.shelfLifeAfterOpenHours) : "",
          }
        : EMPTY_PRODUCT
    );
  }, [product, isEdit]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        unit: form.unit,
        purchaseUnitLabel: form.purchaseUnitLabel,
        purchaseUnitSize: Number(form.purchaseUnitSize) || 1,
        minStock: Number(form.minStock) || 0,
        trackOpening: form.trackOpening,
        shelfLifeAfterOpenHours: form.trackOpening ? form.shelfLifeAfterOpenHours : "",
        allowedRoles: form.allowedRoles,
        active: form.active,
      };
      await api(isEdit ? `/products/${product.id}` : "/products", { method: isEdit ? "PUT" : "POST", body });
      toast.success(isEdit ? "Produto atualizado." : "Produto cadastrado.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={!!product} onOpenChange={(o) => !o && onClose()} isDismissable={!saving} isKeyboardDismissDisabled={saving}>
        <Modal.Container size="cover" scroll="inside">
          <Modal.Dialog>
            <div className="contents" onKeyDown={confirmOnEnter(save, saving)}>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{isEdit ? "Editar produto" : "Novo produto"}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <div className="flex flex-col gap-4 p-1">
                  {error && (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}

                  <TextInput label="Nome" value={form.name} onChange={set("name")} isRequired placeholder="Ex: Toxina botulínica" />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <TextInput label="Categoria" value={form.category} onChange={set("category")} placeholder="Ex: Injetáveis" />
                    <TextInput label="SKU (opcional)" value={form.sku} onChange={set("sku")} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <SelectField
                      label="Unidade base"
                      value={form.unit}
                      onChange={set("unit")}
                      options={[
                        { id: "Un", label: "Unidades (un)" },
                        { id: "Ml", label: "Mililitros (ml)" },
                        { id: "G", label: "Gramas (g)" },
                      ]}
                    />
                    <TextInput label="Embalagem de compra" value={form.purchaseUnitLabel} onChange={set("purchaseUnitLabel")} placeholder="frasco, ampola…" />
                    <TextInput
                      label="Unidades base por embalagem"
                      type="number"
                      min="0"
                      step="any"
                      value={form.purchaseUnitSize}
                      onChange={set("purchaseUnitSize")}
                      description="Ex: 100 (um frasco de botox = 100 un)"
                    />
                  </div>

                  <TextInput
                    label="Estoque mínimo (unidade base)"
                    type="number"
                    min="0"
                    step="any"
                    value={form.minStock}
                    onChange={set("minStock")}
                    description="Abaixo disso, o produto aparece com alerta de reposição."
                  />

                  <Switch isSelected={form.trackOpening} onChange={set("trackOpening")}>
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Label>Controlar abertura de frasco</Label>
                    </Switch.Content>
                  </Switch>
                  {form.trackOpening && (
                    <TextInput
                      label="Validade depois de aberto (horas)"
                      type="number"
                      min="0"
                      value={form.shelfLifeAfterOpenHours}
                      onChange={set("shelfLifeAfterOpenHours")}
                      description="Cada embalagem comprada vira um lote próprio, com data de abertura."
                    />
                  )}

                  <CheckboxGroup value={form.allowedRoles} onChange={set("allowedRoles")}>
                    <Label>Quem pode solicitar movimentações deste produto</Label>
                    <Description>O Gerente sempre pode, direto e sem aprovação.</Description>
                    {["Farmaceutica", "Massoterapeuta"].map((role) => (
                      <Checkbox key={role} value={role} className="flex justify-c">
                        <Checkbox.Content>
                          <Checkbox.Control className="size-5 bg-surface-secondary border border-border">
                            <Checkbox.Indicator/>
                          </Checkbox.Control>
                          <Label>{ROLE_LABEL[role]}</Label>
                        </Checkbox.Content>
                      </Checkbox>
                    ))}
                  </CheckboxGroup>

                </div>
              </Modal.Body>
              <Modal.Footer className="justify-between">
                <div>
                  {isEdit && (
                    <Switch isSelected={form.active} onChange={set("active")}>
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                        <Label>{form.active ? "Produto ativo" : "Produto inativo"}</Label>
                      </Switch.Content>
                    </Switch>
                  )}
                </div>
                <div className="gap-2">
                  <Button variant="tertiary" onPress={onClose} isDisabled={saving} className="mr-2">
                    Cancelar
                    <KeyHint>Esc</KeyHint>
                  </Button>

                  <Button onPress={save} isPending={saving}>
                    Salvar
                    <KeyHint keyValue="enter" onFilled />
                  </Button> 
                </div>
              </Modal.Footer>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------ modal: solicitação ----------------------- */
// chave só para o React identificar a linha. Evitei a API de UUID do navegador
// porque ela só existe em contexto seguro (https ou localhost) e quebra ao
// abrir o app por IP da rede local (http://192.168.x.x).
let rowSeq = 0;
const newRow = () => ({
  key: `row-${++rowSeq}`,
  productId: "",
  packages: "",
  packageCost: "",
  lotNumber: "",
  expiresAt: "",
  quantity: "",
  batchId: "auto",
});

const REQUEST_TITLE = {
  Purchase: "Entrada de estoque",
  Loss: "Registrar perda",
  Adjustment: "Ajuste de inventário",
};

function RequestModal({ type, products, isAdmin, onClose, onSaved }) {
  const [rows, setRows] = useState([newRow()]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!type) return;
    setRows([newRow()]);
    setReason("");
    setError("");
  }, [type]);

  const productOptions = useMemo(
    () => products.filter((p) => p.active && p.canRequest).map((p) => ({ id: p.id, label: p.name })),
    [products]
  );
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const items = rows.map((r) => {
        if (type === "Purchase") {
          return {
            productId: r.productId,
            packages: Number(r.packages),
            packageCost: r.packageCost,
            lotNumber: r.lotNumber,
            expiresAt: r.expiresAt || undefined,
          };
        }
        return {
          productId: r.productId,
          quantity: Number(r.quantity),
          batchId: r.batchId && r.batchId !== "auto" ? r.batchId : undefined,
        };
      });
      await api("/stock/requests", { method: "POST", body: { type, items, reason } });
      toast.success(isAdmin ? "Movimentação aplicada ao estoque." : "Solicitação enviada para aprovação.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={!!type} onOpenChange={(o) => !o && onClose()} isDismissable={!saving} isKeyboardDismissDisabled={saving}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog>
            <div className="contents" onKeyDown={confirmOnEnter(submit, saving)}>
              <Modal.Header>
                <Modal.Heading>{REQUEST_TITLE[type]}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <div className="flex flex-col gap-4 p-1">
                  {!isAdmin && (
                    <Alert status="accent">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>O estoque só muda depois que o Gerente aprovar esta solicitação.</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                  {error && (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}

                  {rows.map((row, idx) => {
                    const product = byId.get(row.productId);
                    const batchOptions = [
                      ...(type === "Loss" ? [{ id: "auto", label: "Automático (vence primeiro)" }] : []),
                      ...(product?.batches ?? []).map((b) => ({
                        id: b.id,
                        label: `${b.lotNumber ? `Lote ${b.lotNumber} · ` : ""}${fmtQty(b.quantity, product.unit)}${
                          b.expiresAt ? ` · vence ${fmtDate(b.expiresAt)}` : ""
                        }`,
                      })),
                    ];
                    return (
                      <Card key={row.key} variant="secondary">
                        <Card.Content className="flex flex-col gap-3">
                          <SelectField
                            label={`Produto ${rows.length > 1 ? idx + 1 : ""}`.trim()}
                            value={row.productId}
                            onChange={(v) => setRow(row.key, { productId: v, batchId: "auto" })}
                            options={productOptions}
                          />

                          {type === "Purchase" && product && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <TextInput
                                label={`Quantidade de ${product.purchaseUnitLabel || "embalagens"}`}
                                type="number"
                                min="0"
                                step="any"
                                value={row.packages}
                                onChange={(v) => setRow(row.key, { packages: v })}
                                description={
                                  row.packages
                                    ? `= ${fmtQty(Number(row.packages) * product.purchaseUnitSize, product.unit)} no estoque`
                                    : undefined
                                }
                              />
                              <TextInput
                                label={`Custo por ${product.purchaseUnitLabel || "embalagem"} (R$)`}
                                type="number"
                                min="0"
                                step="any"
                                value={row.packageCost}
                                onChange={(v) => setRow(row.key, { packageCost: v })}
                              />
                              <TextInput label="Nº do lote" value={row.lotNumber} onChange={(v) => setRow(row.key, { lotNumber: v })} />
                              <DateInput label="Validade" value={row.expiresAt} onChange={(v) => setRow(row.key, { expiresAt: v })} />
                            </div>
                          )}

                          {type !== "Purchase" && product && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <TextInput
                                label={type === "Adjustment" ? `Diferença (${UNIT_LABEL[product.unit]}, + ou −)` : `Quantidade (${UNIT_LABEL[product.unit]})`}
                                type="number"
                                step="any"
                                value={row.quantity}
                                onChange={(v) => setRow(row.key, { quantity: v })}
                              />
                              <SelectField
                                label="Lote"
                                value={row.batchId}
                                onChange={(v) => setRow(row.key, { batchId: v })}
                                options={batchOptions}
                                placeholder="Escolha o lote"
                              />
                            </div>
                          )}

                          {rows.length > 1 && (
                            <div>
                              <Button size="sm" variant="danger-soft" onPress={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                                <Trash2 />
                                Remover item
                              </Button>
                            </div>
                          )}
                        </Card.Content>
                      </Card>
                    );
                  })}

                  <div>
                    <Button size="sm" onPress={() => setRows((rs) => [...rs, newRow()])}>
                      <Plus />
                      Adicionar item
                    </Button>
                  </div>

                  <TextField fullWidth value={reason} onChange={setReason} isRequired={type !== "Purchase"}>
                    <Label>{type === "Purchase" ? "Observação (opcional)" : "Motivo"}</Label>
                    <TextArea placeholder={type === "Loss" ? "Ex: frasco quebrado, vencido…" : "Descreva o motivo"} />
                  </TextField>
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={onClose} isDisabled={saving}>
                  Cancelar
                  <KeyHint>Esc</KeyHint>
                </Button>
                <Button onPress={submit} isPending={saving}>
                  {isAdmin ? "Aplicar" : "Enviar para aprovação"}
                  <KeyHint keyValue="enter" onFilled />
                </Button>
              </Modal.Footer>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------ modal: lotes ----------------------------- */
function BatchesModal({ product, onClose, onChanged }) {
  const [busyId, setBusyId] = useState(null);

  async function markOpened(batch) {
    setBusyId(batch.id);
    try {
      await api(`/stock/batches/${batch.id}/open`, { method: "PATCH", body: {} });
      toast.success("Abertura registrada.");
      onChanged();
    } catch (e) {
      toast.danger(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={!!product} onOpenChange={(o) => !o && onClose()}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Lotes · {product?.name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {product && (
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Lotes do produto">
                      <Table.Header>
                        <Table.Column isRowHeader>Lote</Table.Column>
                        <Table.Column>Saldo</Table.Column>
                        <Table.Column>Validade</Table.Column>
                        {product.trackOpening && <Table.Column>Frasco</Table.Column>}
                      </Table.Header>
                      <Table.Body items={product.batches} 
                        renderEmptyState={() => 
                          <p className="p-4 text-center text-muted">Sem lotes com saldo.</p>
                        }>
                        {(b) => (
                          <Table.Row id={b.id}>
                            <Table.Cell>{b.lotNumber || "—"}</Table.Cell>
                            <Table.Cell>{fmtQty(b.quantity, product.unit)}</Table.Cell>
                            <Table.Cell>
                              <div className="flex flex-wrap items-center gap-2">
                                {fmtDate(b.expiresAt)}
                                {b.isExpired && <Chip color="danger" variant="soft" size="sm">Vencido</Chip>}
                                {b.isExpiringSoon && <Chip color="warning" variant="soft" size="sm">Vence em breve</Chip>}
                              </div>
                            </Table.Cell>
                            {product.trackOpening && (
                              <Table.Cell>
                                {b.openedAt ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>Aberto {fmtDateTime(b.openedAt)}</span>
                                    {b.openedExpiresAt && (
                                      <Chip color={b.isOpenedExpired ? "danger" : "warning"} variant="soft" size="sm">
                                        {b.isOpenedExpired ? "Validade após abrir vencida" : `Usar até ${fmtDateTime(b.openedExpiresAt)}`}
                                      </Chip>
                                    )}
                                  </div>
                                ) : product.canRequest ? (
                                  <Button size="sm" variant="secondary" isPending={busyId === b.id} onPress={() => markOpened(b)}>
                                    Marcar como aberto
                                  </Button>
                                ) : (
                                  <span className="text-muted">Fechado</span>
                                )}
                              </Table.Cell>
                            )}
                          </Table.Row>
                        )}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={onClose}>
                Fechar
                <KeyHint>Esc</KeyHint>
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------ modal: negar ----------------------------- */
function RejectModal({ request, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setNote(""), [request]);

  async function reject() {
    setSaving(true);
    try {
      await api(`/stock/requests/${request.id}/reject`, { method: "PATCH", body: { reviewNote: note } });
      toast("Solicitação negada.");
      onDone();
      onClose();
    } catch (e) {
      toast.danger(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={!!request} onOpenChange={(o) => !o && onClose()} isDismissable={!saving} isKeyboardDismissDisabled={saving}>
        <Modal.Container size="md">
          <Modal.Dialog>
            <div className="contents" onKeyDown={confirmOnEnter(reject, saving)}>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Negar solicitação</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <div className="p-1">
                  <TextField fullWidth value={note} onChange={setNote}>
                    <Label>Motivo (opcional)</Label>
                    <TextArea placeholder="Aparece para quem solicitou" />
                  </TextField>
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={onClose} isDisabled={saving}>
                  Voltar
                  <KeyHint>Esc</KeyHint>
                </Button>
                <Button variant="danger" onPress={reject} isPending={saving}>
                  Negar
                  <KeyHint keyValue="enter" onFilled />
                </Button>
              </Modal.Footer>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------ aviso persistente ------------------------ */
// Aviso fixo no centro inferior da tela enquanto houver solicitação pendente.
// - "Ignorar" só esconde por enquanto: ele volta sozinho quando chega uma
//   solicitação nova, e sempre que a página é aberta de novo (o estado de
//   "ignorado" fica só na memória, de propósito).
// - Some de vez quando todas as pendentes são aprovadas ou negadas.
// - Não aparece na aba "Solicitações", onde o Gerente já está decidindo.
// Para ele valer em QUALQUER página do painel (e não só no Estoque), mova este
// componente e o estado `requests` para o layout do admin.
function PendingApprovalsToast({ requests, isVisible, onReview }) {
  const [dismissedIds, setDismissedIds] = useState([]);

  const hasUnseen = requests.some((r) => !dismissedIds.includes(r.id));
  if (!isVisible || !hasUnseen) return null;

  const count = requests.length;
  const description =
    count === 1
      ? `${describeRequest(requests[0])} ${requests[0].items.map((i) => describeItem(requests[0].type, i)).join("; ")}`
      : "Entradas, baixas e ajustes só mudam o estoque depois de aprovados.";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="region" aria-label="Solicitações pendentes">
      <Alert status="warning" className="pointer-events-auto w-full max-w-xl shadow-overlay">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {count} {count > 1 ? "solicitações aguardando" : "solicitação aguardando"} sua aprovação
          </Alert.Title>
          <Alert.Description className="line-clamp-2 pr-5 ">{description}</Alert.Description>
        </Alert.Content>
        <div className="flex shrink-0 items-center gap-1 self-center">
          <Button size="sm" variant="ghost" onPress={() => setDismissedIds(requests.map((r) => r.id))}>
            Ignorar
          </Button>
          <Button size="sm" variant="tertiary" className="bg-warning text-warning-foreground" onPress={onReview}>
            Revisar
          </Button>
        </div>
      </Alert>
    </div>
  );
}

/* ------------------------------ abas ------------------------------------- */
function ProductsTab({ products, isAdmin, onEdit, onBatches }) {
  const [query, setQuery] = useState("");
  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <TextField fullWidth value={query} onChange={setQuery} aria-label="Buscar produto">
        <Input placeholder="Buscar produto…" className="font-semibold" />
      </TextField>

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Produtos em estoque">
            <Table.Header>
              <Table.Column isRowHeader>Produto</Table.Column>
              <Table.Column>Saldo</Table.Column>
              <Table.Column>Mínimo</Table.Column>
              <Table.Column>Alertas</Table.Column>
              <Table.Column>Ações</Table.Column>
            </Table.Header>
            <Table.Body items={filtered} 
              renderEmptyState={() => 
                <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                  <Inbox />
                  <span className="text-sm text-muted font-semibold">Nenhum produto encontrado</span>
                </EmptyState>
              }>
              {(p) => (
                <Table.Row id={p.id}>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {p.name} {!p.active && <Chip size="sm" variant="soft">Inativo</Chip>}
                      </span>
                      {p.category && <span className="text-xs text-muted">{p.category}</span>}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <span>{fmtQty(p.currentStock, p.unit)}</span>
                      {p.purchaseUnitSize > 1 && p.purchaseUnitLabel && (
                        <span className="text-xs text-muted">
                          ≈ {fmtNum(p.currentStock / p.purchaseUnitSize)} {p.purchaseUnitLabel}(s)
                        </span>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{p.minStock > 0 ? fmtQty(p.minStock, p.unit) : "—"}</Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {p.alerts.lowStock && <Chip color="warning" variant="soft" size="sm">Repor</Chip>}
                      {p.alerts.expired && <Chip color="danger" variant="soft" size="sm">Lote vencido</Chip>}
                      {p.alerts.expiringSoon && <Chip color="warning" variant="soft" size="sm">Vence em breve</Chip>}
                      {p.alerts.openedExpired && <Chip color="danger" variant="soft" size="sm">Frasco aberto vencido</Chip>}
                      {!Object.values(p.alerts).some(Boolean) && <span className="text-muted">—</span>}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onPress={() => onBatches(p.id)}>
                        Lotes
                      </Button>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onPress={() => onEdit(p)}>
                          Editar
                        </Button>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

function RequestsTab({ requests, isAdmin, meId, onApprove, onReject, onCancel, busyId }) {
  const [status, setStatus] = useState("all");
  const shown = requests.filter((r) => status === "all" || r.status === status);

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <SelectField
          label="Filtrar por status"
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "Todas" },
            ...Object.entries(STATUS_META).map(([id, m]) => ({ id, label: m.label })),
          ]}
        />
      </div>

      {shown.length === 0 && 
        <span className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
          <Inbox className="text-muted" />
          <span className="text-sm text-muted font-semibold">Nenhuma solicitação</span>
        </span>
      }

      {shown.map((r) => {
        const meta = STATUS_META[r.status];
        return (
          <Card key={r.id} className="bg-surface-secondary">
            <Card.Header>
              <div className="flex w-full flex-wrap items-start justify-between gap-2">
                <div>
                  <Card.Title>{describeRequest(r)}</Card.Title>
                  <Card.Description>
                    {TYPE_LABEL[r.type]} · {fmtDateTime(r.createdAt)}
                  </Card.Description>
                </div>
                <Chip color={meta.color} variant="soft">
                  {meta.label}
                </Chip>
              </div>
            </Card.Header>
            <Card.Content className="flex flex-col gap-2">
              <ul className="list-disc pl-5">
                {r.items.map((i, idx) => (
                  <li key={idx}>{describeItem(r.type, i)}</li>
                ))}
              </ul>
              {r.reason && <p className="text-sm text-muted">Motivo: {r.reason}</p>}
              {r.reviewedBy && r.status !== "Cancelled" && (
                <p className="text-sm text-muted">
                  {r.status === "Approved" ? "Aprovada" : "Negada"} por {r.reviewedBy.name} em {fmtDateTime(r.reviewedAt)}
                  {r.reviewNote ? ` — Nota: ${r.reviewNote}` : ""}
                </p>
              )}
            </Card.Content>
            {r.status === "Pending" && (isAdmin || r.requestedBy?.id === meId) && (
              <Card.Footer className="flex gap-2">
                {isAdmin && (
                  <>
                    <Button onPress={() => onApprove(r)} isPending={busyId === r.id}>
                      Aprovar
                    </Button>
                    <Button variant="danger" onPress={() => onReject(r)} isDisabled={busyId === r.id}>
                      Negar
                    </Button>
                  </>
                )}
                {r.requestedBy?.id === meId && (
                  <Button variant="tertiary" onPress={() => onCancel(r)} isDisabled={busyId === r.id}>
                    Cancelar solicitação
                  </Button>
                )}
              </Card.Footer>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function HistoryTab({ movements }) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Histórico de movimentações">
          <Table.Header>
            <Table.Column isRowHeader>Data</Table.Column>
            <Table.Column>Produto</Table.Column>
            <Table.Column>Tipo</Table.Column>
            <Table.Column>Quantidade</Table.Column>
            <Table.Column>Lote</Table.Column>
            <Table.Column>Responsável</Table.Column>
            <Table.Column>Motivo</Table.Column>
          </Table.Header>
          <Table.Body items={movements} 
            renderEmptyState={() => 
              <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                <Inbox />
                <span className="text-sm text-muted font-semibold">Sem movimentações</span>
              </EmptyState>
            }>
            {(m) => (
              <Table.Row id={m.id}>
                <Table.Cell>{fmtDateTime(m.createdAt)}</Table.Cell>
                <Table.Cell>{m.product?.name ?? "—"}</Table.Cell>
                <Table.Cell>{TYPE_LABEL[m.type]}</Table.Cell>
                <Table.Cell>
                  <span className={m.quantity > 0 ? "text-success" : "text-danger"}>
                    {m.quantity > 0 ? "+" : ""}
                    {fmtQty(m.quantity, m.product?.unit)}
                  </span>
                </Table.Cell>
                <Table.Cell>{m.batch?.lotNumber || "—"}</Table.Cell>
                <Table.Cell>{m.staff?.name ?? "—"}</Table.Cell>
                <Table.Cell>{m.reason || "—"}</Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

/* ------------------------------ página ----------------------------------- */
export default function Storage() {
  const [me, setMe] = useState(null);
  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [movements, setMovements] = useState([]);
  const [tab, setTab] = useState("products");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [productModal, setProductModal] = useState(null); // objeto do produto, ou {} para novo
  const [requestType, setRequestType] = useState(null);
  const [batchesProductId, setBatchesProductId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const isAdmin = me?.role === "MajorAdmin";

  const load = useCallback(async () => {
    try {
      const staff = await api("/auth/staff/me");
      setMe(staff);
      const [prods, reqs, movs] = await Promise.all([
        api(`/products${staff.role === "MajorAdmin" ? "?includeInactive=true" : ""}`),
        api("/stock/requests"),
        staff.role === "MajorAdmin" ? api("/stock/movements?limit=200") : Promise.resolve([]),
      ]);
      setProducts(prods);
      setRequests(reqs);
      setMovements(movs);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // tempo real: o servidor avisa "stock-changed" e a tela recarrega
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const wsUrl = `${API_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data).type === "stock-changed") load();
      } catch {
        /* mensagem que não é JSON: ignora */
      }
    };
    return () => {
      // em dev o React monta/desmonta o efeito duas vezes; fechar um socket
      // ainda CONNECTING gera o aviso "closed before the connection is
      // established", então nesse caso fecha só quando abrir
      ws.onmessage = null;
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
      else ws.close();
    };
  }, [load]);

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "Pending"), [requests]);
  const pendingCount = pendingRequests.length;
  const batchesProduct = products.find((p) => p.id === batchesProductId) ?? null;
  const alertCount = products.filter((p) => p.active && Object.values(p.alerts).some(Boolean)).length;

  async function approve(r) {
    setBusyId(r.id);
    try {
      await api(`/stock/requests/${r.id}/approve`, { method: "PATCH" });
      toast.success("Solicitação aprovada e aplicada ao estoque.");
      load();
    } catch (e) {
      toast.danger(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(r) {
    setBusyId(r.id);
    try {
      await api(`/stock/requests/${r.id}/cancel`, { method: "PATCH" });
      toast("Solicitação cancelada.");
      load();
    } catch (e) {
      toast.danger(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted text-center font-medium py-10">Carregando estoque…</p>;

  return (
    <div className="flex flex-col gap-6 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Estoque</h1>
          <p className="text-sm text-muted font-semibold">
            {products.filter((p) => p.active).length} produtos
            {alertCount > 0 && ` · ${alertCount} com alerta`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <Button variant="tertiary" className="rounded-lg" onPress={() => setProductModal({})}>Novo produto</Button>}
          <Button className="rounded-lg" onPress={() => setRequestType("Purchase")}>{isAdmin ? "Dar entrada" : "Solicitar entrada"}</Button>
          <Button className="rounded-lg" variant="danger-soft" onPress={() => setRequestType("Loss")}>{isAdmin ? "Registrar perda" : "Solicitar baixa"}</Button>
          <Button className="rounded-lg" variant="outline" onPress={() => setRequestType("Adjustment")}>{isAdmin ? "Ajustar" : "Solicitar ajuste"}</Button>
        </div>
      </div>

      {loadError && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar o estoque</Alert.Title>
            <Alert.Description>{loadError}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Seções do estoque">
            <Tabs.Tab id="products">
              Produtos
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="requests">
              {isAdmin ? "Solicitações" : "Minhas solicitações"}
              {pendingCount > 0 && (
                <Chip color="warning" variant="soft" size="sm" className="ml-2">
                  {pendingCount}
                </Chip>
              )}
              <Tabs.Indicator />
            </Tabs.Tab>
            {isAdmin && (
              <Tabs.Tab id="history">
                Histórico
                <Tabs.Indicator />
              </Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="products" className="pt-4">
          <ProductsTab products={products} isAdmin={isAdmin} onEdit={setProductModal} onBatches={setBatchesProductId} />
        </Tabs.Panel>
        <Tabs.Panel id="requests" className="pt-4">
          <RequestsTab
            requests={requests}
            isAdmin={isAdmin}
            meId={me?.id}
            busyId={busyId}
            onApprove={approve}
            onReject={setRejecting}
            onCancel={cancel}
          />
        </Tabs.Panel>
        {isAdmin && (
          <Tabs.Panel id="history" className="pt-4">
            <HistoryTab movements={movements} />
          </Tabs.Panel>
        )}
      </Tabs>

      <PendingApprovalsToast
        requests={pendingRequests}
        isVisible={isAdmin && tab !== "requests"}
        onReview={() => setTab("requests")}
      />

      <ProductModal product={productModal} onClose={() => setProductModal(null)} onSaved={load} />
      <RequestModal type={requestType} products={products} isAdmin={isAdmin} onClose={() => setRequestType(null)} onSaved={load} />
      <BatchesModal product={batchesProduct} onClose={() => setBatchesProductId(null)} onChanged={load} />
      <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={load} />
    </div>
  );
}
