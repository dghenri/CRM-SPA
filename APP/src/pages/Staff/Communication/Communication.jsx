import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
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
import { Inbox, Megaphone, Pencil, Plus, Send, Trash2 } from "lucide-react";
import api from "../../../api/api";
import {
  createBanner,
  deleteBanner,
  deleteBroadcast,
  fetchAdminBanners,
  fetchBroadcasts,
  sendBroadcast,
  setBannerActive,
  updateBanner,
} from "../../../api/notifications";
import NotificationAlert, { NOTIFICATION_STATUS_OPTIONS } from "../../../components/NotificationAlert";

/* ---------------------------------------------------------------------------
 * Página "Comunicação" (equipe): dispara notificações para o sino dos clientes
 * e gerencia os banners do carrossel da Home deles.
 *
 * Avisos automáticos (perfil incompleto, cupom BEMVINDO30, primeira sessão,
 * sessão agendada/confirmada/cancelada) são gerados pelo servidor e NÃO
 * aparecem aqui - esta página é só para o que a equipe envia manualmente.
 * ------------------------------------------------------------------------- */

// Para onde o botão do aviso/banner pode levar. Só rotas internas do app
// (o back-end recusa links externos). Para liberar outra tela, inclua aqui.
const DESTINATIONS = [
  { id: "/user/services", label: "Procedimentos (agendar)" },
  { id: "/user/coupons", label: "Cupons" },
  { id: "/user/scheduling", label: "Meus agendamentos" },
  { id: "/user/profile", label: "Meu perfil" },
];
const NO_BUTTON = "none";
const DESTINATION_OPTIONS = [{ id: NO_BUTTON, label: "Sem botão" }, ...DESTINATIONS];

const CATEGORY_OPTIONS = [
  { id: "General", label: "Aviso geral (todos recebem)" },
  { id: "Promotions", label: "Promoção (só quem aceita promoções)" },
  { id: "News", label: "Novidade (só quem aceita novidades)" },
];

const BANNER_STATUS = {
  live: { label: "No ar", color: "success" },
  scheduled: { label: "Agendado", color: "accent" },
  expired: { label: "Encerrado", color: "default" },
  inactive: { label: "Desligado", color: "warning" },
};

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/* ------------------------------ campos ----------------------------------- */
function TextInput({ label, value, onChange, type = "text", placeholder, description, isRequired, maxLength }) {
  return (
    <TextField fullWidth value={value} onChange={onChange} isRequired={isRequired}>
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} maxLength={maxLength} className="bg-surface-secondary border border-border" />
      {description && <Description>{description}</Description>}
    </TextField>
  );
}

function TextAreaField({ label, value, onChange, placeholder, maxLength }) {
  return (
    <TextField fullWidth value={value} onChange={onChange}>
      <Label>{label}</Label>
      <TextArea placeholder={placeholder} maxLength={maxLength} rows={3} className="bg-surface-secondary border border-border" />
      {maxLength && <Description className="text-right">{value.length}/{maxLength}</Description>}
    </TextField>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "Selecione" }) {
  return (
    <Select fullWidth placeholder={placeholder} value={value || null} onChange={(v) => onChange(v ?? "")}>
      <Label>{label}</Label>
      <Select.Trigger className="bg-surface-secondary border border-border">
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

// Recebe/devolve string "YYYY-MM-DD" (ou "" se vazio)
function DateInput({ label, value, onChange, description }) {
  const dateValue = useMemo(() => {
    try {
      return value ? parseDate(value) : null;
    } catch {
      return null;
    }
  }, [value]);

  return (
    <I18nProvider locale="pt-BR">
      <DatePicker className="w-full" value={dateValue} onChange={(d) => onChange(d ? d.toString() : "")}>
        <Label>{label}</Label>
        <DateField.Group fullWidth className="border border-border bg-surface-secondary">
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

// Confirmação (AlertDialog do HeroUI) para envio em massa e exclusões
function ConfirmDialog({ isOpen, onOpenChange, title, children, confirmLabel = "Confirmar", status = "danger", icon: Icon = Trash2, onConfirm }) {
  return (
    <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Backdrop variant="blur" isKeyboardDismissDisabled={false}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-115 border-6">
            <AlertDialog.Header className="items-center">
              <AlertDialog.Icon status={status} className="size-15">
                <Icon className="size-8" />
              </AlertDialog.Icon>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="text-center text-sm font-semibold leading-5 text-muted">{children}</div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" className="w-full">
                Cancelar
              </Button>
              <Button slot="close" variant={status === "danger" ? "danger" : "primary"} className="w-full" onPress={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

function Empty({ children }) {
  return (
    <EmptyState className="flex w-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Inbox />
      <span className="text-sm font-semibold text-muted">{children}</span>
    </EmptyState>
  );
}

/* ------------------------------ aba: notificações ------------------------ */
const EMPTY_NOTICE = {
  audience: "all",
  userIds: [],
  status: "Default",
  category: "General",
  title: "",
  description: "",
  destination: NO_BUTTON,
  buttonLabel: "",
};

function NotificationsTab() {
  const [form, setForm] = useState(EMPTY_NOTICE);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchBroadcasts());
    } catch (err) {
      toast(err.message || "Não foi possível carregar o histórico.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // a lista de clientes só é necessária para "clientes específicos"
  useEffect(() => {
    if (form.audience !== "selected" || clients.length > 0) return;
    api.get("/users").then(setClients).catch(() => toast("Não foi possível carregar os clientes."));
  }, [form.audience, clients.length]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return q ? clients.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q)) : clients;
  }, [clients, clientSearch]);

  const hasButton = form.destination !== NO_BUTTON;
  const buttonLabel = form.buttonLabel.trim() || (hasButton ? "Abrir" : "");
  const recipientsLabel = form.audience === "all" ? "todos os clientes" : `${form.userIds.length} cliente(s)`;

  const preview = {
    status: form.status,
    title: form.title.trim() || "Título da notificação",
    description: form.description.trim(),
    actionLabel: hasButton ? buttonLabel : null,
    actionPath: hasButton ? form.destination : null,
    dismissible: true,
    read: true,
    createdAt: new Date().toISOString(),
  };

  const validate = () => {
    if (!form.title.trim()) return "Informe o título.";
    if (form.audience === "selected" && form.userIds.length === 0) return "Escolha ao menos um cliente.";
    return "";
  };

  const requestSend = () => {
    const problem = validate();
    setError(problem);
    if (!problem) setConfirmOpen(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const result = await sendBroadcast({
        audience: form.audience,
        userIds: form.audience === "selected" ? form.userIds : undefined,
        status: form.status,
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim(),
        actionLabel: hasButton ? buttonLabel : undefined,
        actionPath: hasButton ? form.destination : undefined,
      });
      toast("Notificação enviada", { description: `${result.recipientCount} cliente(s) vão ver no sino.`, variant: "success" });
      setForm(EMPTY_NOTICE);
      setError("");
      loadHistory();
    } catch (err) {
      setError(err.message || "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (broadcast) => {
    try {
      await deleteBroadcast(broadcast.id);
      toast("Disparo removido", { description: "Saiu do sino de todos os clientes." });
      loadHistory();
    } catch (err) {
      toast(err.message || "Não foi possível remover.");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="rounded-2xl border border-border">
        <Card.Header>
          <Card.Title className="text-lg font-semibold">Nova notificação</Card.Title>
          <Card.Description>Aparece no sino da Home dos clientes.</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {error && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <SelectField
            label="Para quem"
            value={form.audience}
            onChange={set("audience")}
            options={[
              { id: "all", label: "Todos os clientes" },
              { id: "selected", label: "Clientes específicos" },
            ]}
          />

          {form.audience === "selected" && (
            <div className="flex flex-col gap-2">
              <TextInput label="Buscar cliente" value={clientSearch} onChange={setClientSearch} placeholder="Nome ou e-mail" />
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border p-3">
                {filteredClients.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum cliente encontrado.</p>
                ) : (
                  <CheckboxGroup aria-label="Clientes" value={form.userIds} onChange={set("userIds")}>
                    {filteredClients.map((c) => (
                      <Checkbox key={c.id} value={c.id} variant="secondary">
                        <Checkbox.Content>
                          <Checkbox.Control className="size-5 border border-border">
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Label>{c.name}</Label>
                          <Description>{c.email}</Description>
                        </Checkbox.Content>
                      </Checkbox>
                    ))}
                  </CheckboxGroup>
                )}
              </div>
              <p className="text-xs text-muted">{form.userIds.length} selecionado(s)</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Tipo" value={form.status} onChange={set("status")} options={NOTIFICATION_STATUS_OPTIONS} />
            <SelectField label="Categoria" value={form.category} onChange={set("category")} options={CATEGORY_OPTIONS} />
          </div>

          <TextInput label="Título" value={form.title} onChange={set("title")} isRequired maxLength={80} placeholder="Ex: Novos horários na sexta" />
          <TextAreaField label="Mensagem (opcional)" value={form.description} onChange={set("description")} maxLength={300} placeholder="Detalhes do aviso" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Botão leva para" value={form.destination} onChange={set("destination")} options={DESTINATION_OPTIONS} />
            {hasButton && (
              <TextInput label="Texto do botão" value={form.buttonLabel} onChange={set("buttonLabel")} maxLength={24} placeholder="Abrir" />
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="primary" isPending={sending} onPress={requestSend}>
              <Send size={16} />
              Enviar para {recipientsLabel}
            </Button>
          </div>
        </Card.Content>
      </Card>

      <div className="flex flex-col gap-6">
        <Card className="rounded-2xl border border-border">
          <Card.Header>
            <Card.Title className="text-lg font-semibold">Prévia</Card.Title>
            <Card.Description>Como o cliente vai ver no sino.</Card.Description>
          </Card.Header>
          <Card.Content>
            <NotificationAlert notification={preview} />
          </Card.Content>
        </Card>

        <Card className="rounded-2xl border border-border">
          <Card.Header>
            <Card.Title className="text-lg font-semibold">Enviadas</Card.Title>
          </Card.Header>
          <Card.Content>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Notificações enviadas">
                  <Table.Header>
                    <Table.Column isRowHeader>Aviso</Table.Column>
                    <Table.Column>Entregues</Table.Column>
                    <Table.Column>Lidas</Table.Column>
                    <Table.Column>Enviada</Table.Column>
                    <Table.Column> </Table.Column>
                  </Table.Header>
                  <Table.Body items={history} renderEmptyState={() => <Empty>{isLoading ? "Carregando..." : "Nenhuma notificação enviada ainda"}</Empty>}>
                    {(b) => (
                      <Table.Row id={b.id}>
                        <Table.Cell>
                          <div className="flex flex-col">
                            <span className="font-semibold">{b.title}</span>
                            <span className="text-xs text-muted">
                              {b.audience === "all" ? "Todos os clientes" : "Clientes específicos"}
                              {b.category !== "General" && ` · ${b.category === "Promotions" ? "Promoção" : "Novidade"}`}
                            </span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          {b.delivered}/{b.recipientCount}
                        </Table.Cell>
                        <Table.Cell>{b.readCount}</Table.Cell>
                        <Table.Cell>
                          <div className="flex flex-col">
                            <span>{fmtDateTime(b.createdAt)}</span>
                            {b.createdByName && <span className="text-xs text-muted">{b.createdByName}</span>}
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Button isIconOnly size="sm" variant="ghost" aria-label="Retirar dos clientes" onPress={() => setToDelete(b)}>
                            <Trash2 size={16} />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Enviar notificação"
        status="accent"
        icon={Send}
        confirmLabel="Enviar"
        onConfirm={send}
      >
        Enviar <span className="font-bold">“{form.title.trim()}”</span> para <span className="font-bold">{recipientsLabel}</span>?
        <br />
        Depois de enviada, só dá para retirar da lista de todos de uma vez.
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Retirar notificação"
        confirmLabel="Retirar"
        onConfirm={() => remove(toDelete)}
      >
        Retirar <span className="font-bold">“{toDelete?.title}”</span> do sino de todos os clientes?
      </ConfirmDialog>
    </div>
  );
}

/* ------------------------------ aba: banners ----------------------------- */
const EMPTY_BANNER = { title: "", description: "", destination: NO_BUTTON, buttonLabel: "", startsAt: "", endsAt: "", order: "0", isActive: true };

function BannerModal({ banner, onClose, onSaved }) {
  const isEdit = !!banner?.id;
  const [form, setForm] = useState(EMPTY_BANNER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!banner) return;
    setError("");
    setForm(
      banner.id
        ? {
            title: banner.title,
            description: banner.description ?? "",
            destination: banner.path ?? NO_BUTTON,
            buttonLabel: banner.buttonLabel ?? "",
            startsAt: toDateInput(banner.startsAt),
            endsAt: toDateInput(banner.endsAt),
            order: String(banner.order ?? 0),
            isActive: banner.isActive,
          }
        : EMPTY_BANNER
    );
  }, [banner]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const hasButton = form.destination !== NO_BUTTON;

  const save = async () => {
    if (!form.title.trim()) return setError("Informe o título.");
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        path: hasButton ? form.destination : "",
        buttonLabel: hasButton ? form.buttonLabel.trim() || "Abrir" : "",
        // início vale desde 00:00 e o fim até 23:59 do dia escolhido (fuso do navegador)
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
        order: Number(form.order) || 0,
        isActive: form.isActive,
      };
      if (isEdit) await updateBanner(banner.id, payload);
      else await createBanner(payload);
      toast(isEdit ? "Banner atualizado" : "Banner criado", { variant: "success" });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen={!!banner} onOpenChange={(o) => !o && onClose()} isDismissable={!saving} isKeyboardDismissDisabled={saving}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{isEdit ? "Editar banner" : "Novo banner"}</Modal.Heading>
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

                {/* prévia no formato do carrossel */}
                <div className="relative h-40 overflow-hidden rounded-2xl bg-black p-4 text-white">
                  <div className="absolute inset-0 bg-linear-to-br from-black via-black to-[#4881fe]/60" />
                  <div className="relative z-10 flex h-full flex-col gap-2">
                    <h3 className="text-xl font-bold">{form.title.trim() || "Título do banner"}</h3>
                    <p className="pr-20 text-sm">{form.description.trim() || "Descrição do banner"}</p>
                    {hasButton && (
                      <span className="mt-auto w-fit rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black">
                        {form.buttonLabel.trim() || "Abrir"}
                      </span>
                    )}
                  </div>
                </div>

                <TextInput label="Título" value={form.title} onChange={set("title")} isRequired maxLength={60} placeholder="Ex: Semana da pele" />
                <TextAreaField label="Descrição (opcional)" value={form.description} onChange={set("description")} maxLength={160} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SelectField label="Botão leva para" value={form.destination} onChange={set("destination")} options={DESTINATION_OPTIONS} />
                  {hasButton && <TextInput label="Texto do botão" value={form.buttonLabel} onChange={set("buttonLabel")} maxLength={24} placeholder="Abrir" />}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DateInput label="Começa em (opcional)" value={form.startsAt} onChange={set("startsAt")} description="Vazio = já no ar" />
                  <DateInput label="Termina em (opcional)" value={form.endsAt} onChange={set("endsAt")} description="Vazio = sem fim" />
                </div>

                <TextInput label="Ordem" type="number" value={form.order} onChange={set("order")} description="Menor número aparece primeiro (depois dos avisos automáticos do cliente)" />

              </div>
            </Modal.Body>
            <Modal.Footer className="justify-between">
              <div>
                <Switch isSelected={form.isActive} onChange={set("isActive")}>
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Label>Ativo</Label>
                  </Switch.Content>
                </Switch>
              </div>
              <div>
                <Button slot="close" variant="tertiary" isDisabled={saving} className="mr-2">
                  Cancelar
                </Button>
                <Button variant="primary" isPending={saving} onPress={save}>
                  Salvar
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function BannersTab() {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = fechado | {} = novo | banner = editar
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setBanners(await fetchAdminBanners());
    } catch (err) {
      toast(err.message || "Não foi possível carregar os banners.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (banner, isActive) => {
    const previous = banners;
    setBanners((list) => list.map((b) => (b.id === banner.id ? { ...b, isActive } : b)));
    try {
      await setBannerActive(banner.id, isActive);
      load();
    } catch (err) {
      setBanners(previous);
      toast(err.message || "Não foi possível alterar.");
    }
  };

  const remove = async (banner) => {
    try {
      await deleteBanner(banner.id);
      toast("Banner removido");
      load();
    } catch (err) {
      toast(err.message || "Não foi possível remover.");
    }
  };

  const destinationLabel = (path) => DESTINATIONS.find((d) => d.id === path)?.label ?? path ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <Alert status="accent" className="bg-background">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            Os avisos automáticos (completar perfil, cupom de boas-vindas e primeira sessão) aparecem antes dos seus banners
            e somem sozinhos quando o cliente conclui a ação.
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <div className="flex justify-end">
        <Button variant="primary" onPress={() => setEditing({})}>
          <Plus size={16} />
          Novo banner
        </Button>
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Banners do carrossel">
            <Table.Header>
              <Table.Column isRowHeader>Banner</Table.Column>
              <Table.Column>Botão</Table.Column>
              <Table.Column>Período</Table.Column>
              <Table.Column>Situação</Table.Column>
              <Table.Column>Ativo</Table.Column>
              <Table.Column> </Table.Column>
            </Table.Header>
            <Table.Body items={banners} renderEmptyState={() => <Empty>{isLoading ? "Carregando..." : "Nenhum banner criado"}</Empty>}>
              {(b) => (
                <Table.Row id={b.id}>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <span className="font-semibold">{b.title}</span>
                      {b.description && <span className="max-w-xs truncate text-xs text-muted">{b.description}</span>}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{b.buttonLabel ? `${b.buttonLabel} → ${destinationLabel(b.path)}` : "—"}</Table.Cell>
                  <Table.Cell>
                    {b.startsAt || b.endsAt ? `${fmtDate(b.startsAt)} – ${fmtDate(b.endsAt)}` : "Sem prazo"}
                  </Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" variant="soft" color={BANNER_STATUS[b.status]?.color ?? "default"}>
                      {BANNER_STATUS[b.status]?.label ?? b.status}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <Switch aria-label={`Ativar ${b.title}`} isSelected={b.isActive} onChange={(v) => toggle(b, v)}>
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-1">
                      <Button isIconOnly size="sm" variant="ghost" aria-label="Editar" onPress={() => setEditing(b)}>
                        <Pencil size={16} />
                      </Button>
                      <Button isIconOnly size="sm" variant="ghost" aria-label="Remover" onPress={() => setToDelete(b)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <BannerModal banner={editing} onClose={() => setEditing(null)} onSaved={load} />

      <ConfirmDialog
        isOpen={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Remover banner"
        confirmLabel="Remover"
        onConfirm={() => remove(toDelete)}
      >
        Remover o banner <span className="font-bold">“{toDelete?.title}”</span>? Isso não pode ser desfeito.
      </ConfirmDialog>
    </div>
  );
}

/* ------------------------------ página ----------------------------------- */
export default function CommunicationPage() {
  const [tab, setTab] = useState("notifications");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Megaphone className="text-muted" />
        <div>
          <h1 className="text-2xl font-semibold">Comunicação</h1>
          <p className="text-sm text-muted">Notificações no sino e banners do carrossel da Home dos clientes.</p>
        </div>
      </div>

      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Comunicação com clientes">
            <Tabs.Tab id="notifications">
              Notificações
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="banners">
              Banners
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="notifications" className="pt-4">
          <NotificationsTab />
        </Tabs.Panel>
        <Tabs.Panel id="banners" className="pt-4">
          <BannersTab />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
