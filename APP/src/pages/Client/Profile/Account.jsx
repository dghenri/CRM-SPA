import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MobileNav from "../../../components/MobileNav";
import { useAuth } from "../../../context/AuthContext";
import api, { assetUrl } from "../../../api/api";

import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import {
  Alert,
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Calendar,
  Chip,
  DateField,
  DatePicker,
  Description,
  I18nProvider,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  TextField,
  toast,
} from "@heroui/react";
import {
  BellRing,
  Cake,
  ChevronRight,
  LockKeyhole,
  MapPin,
  MapPinned,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";

/* ---------------------------------------------------------------------------
 * Página "Conta". O Profile manda o cliente para cá com ?editar=<seção> e a
 * página mostra só o formulário daquela seção:
 *
 *   /user/account?editar=nome | telefone | nascimento | senha
 *                         | enderecos | notificacoes | foto
 *
 * Cada formulário salva sozinho na API e atualiza o usuário do AuthContext.
 * ------------------------------------------------------------------------- */

/* ------------------------------ foto: envio ------------------------------ */
// ÚNICO ponto que sabe COMO a foto vai para o servidor: um arquivo JPEG (já
// recortado em 512x512) enviado em multipart/form-data no campo "file", igual à
// sua API de imagens. O servidor grava em uploads/avatars e devolve o usuário
// com `avatarUrl` = caminho do arquivo (o assetUrl() transforma em URL completa).
const saveAvatar = (blob) => {
  const form = new FormData();
  form.append("file", blob, "avatar.jpg");
  return api.put("/users/me/avatar", form);
};
const removeAvatar = () => api.delete("/users/me/avatar");

const AVATAR_SIZE = 512;
const AVATAR_MAX_BYTES = 1_500_000; // o servidor aceita até 2 MB

// Recorta a foto no centro (quadrado), reduz para 512x512 e devolve um Blob JPEG
async function fileToAvatarBlob(file) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 15 * 1024 * 1024) throw new Error("A imagem é muito grande (máximo 15 MB).");

  let bitmap;
  try {
    // "from-image" respeita a rotação gravada pela câmera do celular
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não foi possível ler essa imagem. Tente outra (JPG ou PNG).");
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco no JPEG
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close?.();

  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("Não foi possível reduzir essa foto. Tente outra.");
}

/* ------------------------------ helpers ---------------------------------- */
const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

function formatPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// Máscara que deixa o apagar (backspace) funcionar: se o cliente só apagou um
// caractere da máscara, "(" ou "-", por exemplo, o que ele quis foi apagar o último número
function maskedChange(next, previous, format) {
  const nextDigits = onlyDigits(next);
  const prevDigits = onlyDigits(previous);
  if (next.length < previous.length && nextDigits === prevDigits) return format(prevDigits.slice(0, -1));
  return format(nextDigits);
}

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

// "1990-05-10T00:00:00.000Z" -> "1990-05-10". Pega os 10 primeiros caracteres
// (e não converte para o fuso local): a data de nascimento é guardada à meia-noite UTC
const birthdateToIso = (value) => (value ? String(value).slice(0, 10) : "");

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const notify = (message, variant = "success") => toast(message, { variant });

// Roda uma ação assíncrona controlando "salvando" e a mensagem de erro
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (fn) => {
    setPending(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err.message || "Não foi possível concluir. Tente novamente.");
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, setError, run };
}

/* ------------------------------ peças visuais ---------------------------- */
function ErrorAlert({ message }) {
  if (!message) return null;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function Field({ label, value, onChange, description, ...inputProps }) {
  return (
    <TextField fullWidth value={value} onChange={onChange}>
      <Label>{label}</Label>
      <Input {...inputProps} />
      {description && <Description>{description}</Description>}
    </TextField>
  );
}

function FormCard({ onSubmit, children }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="grid gap-4 rounded-2xl bg-overlay p-4"
    >
      {children}
    </form>
  );
}

function SaveButton({ pending, disabled, children = "Salvar" }) {
  return (
    <Button type="submit" className="w-full" isPending={pending} isDisabled={disabled}>
      {children}
    </Button>
  );
}

/* ------------------------------ nome ------------------------------------- */
function NameForm({ user, onSaved }) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const { pending, error, setError, run } = useAction();

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const nameChanged = cleanName !== (user.name ?? "");
  const emailChanged = cleanEmail !== String(user.email ?? "").toLowerCase();

  const submit = () => {
    if (cleanName.length < 2) return setError("Informe seu nome (mínimo 2 letras).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Informe um e-mail válido.");
    if (emailChanged && !password) return setError("Para alterar o e-mail, informe sua senha atual.");

    // manda só o que mudou; a senha só vai junto quando o e-mail muda
    const body = {};
    if (nameChanged) body.name = cleanName;
    if (emailChanged) {
      body.email = cleanEmail;
      body.currentPassword = password;
    }
    const message = emailChanged && nameChanged ? "Nome e e-mail atualizados." : emailChanged ? "E-mail atualizado." : "Nome atualizado.";
    run(async () => onSaved(await api.put("/users/me", body), message));
  };

  return (
    <FormCard onSubmit={submit}>
      <ErrorAlert message={error} />
      <Field label="Nome completo" value={name} onChange={setName} autoComplete="name" maxLength={100} />
      <Field label="E-mail" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="email" maxLength={120} />
      {emailChanged && (
        <Field
          label="Senha atual"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          description="Por segurança, confirme sua senha para trocar o e-mail. Ele é o seu login."
        />
      )}
      <SaveButton pending={pending} disabled={!nameChanged && !emailChanged} />
    </FormCard>
  );
}

/* ------------------------------ telefone --------------------------------- */
function PhoneForm({ user, onSaved }) {
  const initial = formatPhone(user.phone);
  const [phone, setPhone] = useState(initial);
  const { pending, error, setError, run } = useAction();
  const digits = onlyDigits(phone);

  const submit = () => {
    if (digits && digits.length < 10) return setError("Informe o telefone com DDD (10 ou 11 números).");
    run(async () => onSaved(await api.put("/users/me", { phone: digits ? phone : "" }), digits ? "Telefone atualizado." : "Telefone removido."));
  };

  return (
    <FormCard onSubmit={submit}>
      <ErrorAlert message={error} />
      <Field
        label="Telefone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(71) 99999-9999"
        value={phone}
        onChange={(v) => setPhone((prev) => maskedChange(v, prev, formatPhone))}
        description="Usamos para confirmar e lembrar das suas sessões. Deixe vazio para remover."
      />
      <SaveButton pending={pending} disabled={phone === initial} />
    </FormCard>
  );
}

/* ------------------------------ nascimento ------------------------------- */
function BirthdateForm({ user, onSaved }) {
  const initialIso = birthdateToIso(user.birthdate);
  const [value, setValue] = useState(() => (initialIso ? parseDate(initialIso) : null));
  const { pending, error, run } = useAction();

  const maxDate = useMemo(() => today(getLocalTimeZone()), []);
  const minDate = useMemo(() => parseDate("1900-01-01"), []);
  const iso = value ? value.toString() : "";

  const submit = () => run(async () => onSaved(await api.put("/users/me", { birthdate: iso }), "Data de nascimento atualizada."));

  return (
    <FormCard onSubmit={submit}>
      <ErrorAlert message={error} />
      <I18nProvider locale="pt-BR">
        <DatePicker className="w-full" value={value} onChange={setValue} minValue={minDate} maxValue={maxDate}>
          <Label>Data de nascimento</Label>
          <DateField.Group fullWidth className="border border-border">
            <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            <DateField.Suffix>
              <DatePicker.Trigger>
                <DatePicker.TriggerIndicator />
              </DatePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <Description>Digite a data ou toque no calendário. Toque no ano para mudar rápido.</Description>
          <DatePicker.Popover>
            <Calendar aria-label="Data de nascimento" defaultFocusedValue={value ? undefined : parseDate("1990-01-01")}>
              <Calendar.Header>
                <Calendar.YearPickerTrigger>
                  <Calendar.YearPickerTriggerHeading />
                  <Calendar.YearPickerTriggerIndicator />
                </Calendar.YearPickerTrigger>
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
              </Calendar.Grid>
              <Calendar.YearPickerGrid>
                <Calendar.YearPickerGridBody />
              </Calendar.YearPickerGrid>
            </Calendar>
          </DatePicker.Popover>
        </DatePicker>
      </I18nProvider>
      <SaveButton pending={pending} disabled={!iso || iso === initialIso} />
    </FormCard>
  );
}

/* ------------------------------ senha ------------------------------------ */
const MIN_PASSWORD = 8;

function PasswordForm({ onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const { pending, error, setError, run } = useAction();

  const submit = () => {
    if (next.length < MIN_PASSWORD) return setError(`A nova senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
    if (next === current) return setError("A nova senha deve ser diferente da atual.");
    if (next !== confirm) return setError("A confirmação não confere com a nova senha.");

    run(async () => {
      await api.patch("/users/me/password", { currentPassword: current, newPassword: next });
      onDone("Senha alterada com sucesso.");
    });
  };

  const type = show ? "text" : "password";
  return (
    <FormCard onSubmit={submit}>
      <ErrorAlert message={error} />
      <Field label="Senha atual" type={type} autoComplete="current-password" value={current} onChange={setCurrent} />
      <Field
        label="Nova senha"
        type={type}
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        description={`Mínimo de ${MIN_PASSWORD} caracteres.`}
      />
      <Field label="Confirmar nova senha" type={type} autoComplete="new-password" value={confirm} onChange={setConfirm} />
      <Switch isSelected={show} onChange={setShow}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <Label>Mostrar senhas</Label>
        </Switch.Content>
      </Switch>
      <SaveButton pending={pending} disabled={!current || !next || !confirm}>
        Alterar senha
      </SaveButton>
    </FormCard>
  );
}

/* ------------------------------ notificações ----------------------------- */
const NOTIFICATION_DEFAULTS = {
  sessionReminders: true,
  promotions: true,
  news: false,
  viaEmail: true,
  viaWhatsapp: true,
};

const NOTIFICATION_GROUPS = [
  {
    title: "O que você quer receber",
    items: [
      { key: "sessionReminders", label: "Lembretes de sessão", description: "Aviso antes das suas sessões agendadas." },
      { key: "promotions", label: "Promoções e cupons", description: "Ofertas e descontos exclusivos para você." },
      { key: "news", label: "Novidades do SPA", description: "Novos tratamentos, eventos e dicas." },
    ],
  },
  {
    title: "Por onde",
    items: [
      { key: "viaEmail", label: "E-mail", description: "Mensagens enviadas para o seu e-mail." },
      { key: "viaWhatsapp", label: "WhatsApp", description: "Mensagens enviadas para o seu telefone." },
    ],
  },
];

function NotificationsForm({ user, onSaved }) {
  const initial = useMemo(() => ({ ...NOTIFICATION_DEFAULTS, ...(user.notificationPrefs || {}) }), [user.notificationPrefs]);
  const [prefs, setPrefs] = useState(initial);
  const { pending, error, run } = useAction();
  const dirty = Object.keys(NOTIFICATION_DEFAULTS).some((k) => prefs[k] !== initial[k]);

  const submit = () =>
    run(async () => {
      const saved = await api.put("/users/me/notifications", prefs);
      onSaved({ ...user, notificationPrefs: saved }, "Preferências salvas.");
    });

  return (
    <FormCard onSubmit={submit}>
      <ErrorAlert message={error} />
      {NOTIFICATION_GROUPS.map((group) => (
        <div key={group.title} className="grid gap-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted">{group.title}</h3>
          {group.items.map((item) => (
            <Switch
              key={item.key}
              className="w-full flex-row-reverse justify-between gap-3"
              isSelected={prefs[item.key]}
              onChange={(checked) => setPrefs((p) => ({ ...p, [item.key]: checked }))}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label>{item.label}</Label>
                <Description>{item.description}</Description>
              </Switch.Content>
            </Switch>
          ))}
        </div>
      ))}
      <SaveButton pending={pending} disabled={!dirty} />
    </FormCard>
  );
}

/* ------------------------------ foto ------------------------------------- */
function PhotoForm({ user, onSaved }) {
  const inputRef = useRef(null);
  const [picked, setPicked] = useState(null); // { blob, url } da foto escolhida, ainda não enviada
  const preview = picked?.url ?? null;
  const [reading, setReading] = useState(false);
  const { pending, error, setError, run } = useAction();

  // libera a memória do preview anterior (troca de foto ou saída da tela)
  useEffect(() => () => picked && URL.revokeObjectURL(picked.url), [picked]);

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const blob = await fileToAvatarBlob(file);
      setPicked({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  const save = () =>
    run(async () => {
      const updated = await saveAvatar(picked.blob);
      setPicked(null);
      onSaved({ ...user, ...updated }, "Foto atualizada.", { stay: true });
    });

  const remove = () =>
    run(async () => {
      const updated = await removeAvatar();
      setPicked(null);
      onSaved({ ...user, ...updated }, "Foto removida.", { stay: true });
    });

  const shown = preview ?? assetUrl(user.avatarUrl);

  return (
    <div className="grid justify-items-center gap-4 rounded-2xl bg-overlay p-4">
      <div className="w-full">
        <ErrorAlert message={error} />
      </div>
      <Avatar className="h-32 w-32 rounded-full text-3xl">
        <Avatar.Image src={shown} alt="Sua foto de perfil" />
        <Avatar.Fallback>{getInitials(user.name)}</Avatar.Fallback>
      </Avatar>
      <p className="text-center text-sm text-muted">
        {preview ? "Confira como ficou e toque em Salvar foto." : "A foto é recortada no centro, em formato quadrado."}
      </p>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pickFile} aria-label="Escolher foto" />

      <div className="grid w-full gap-2">
        <Button variant={preview ? "tertiary" : "primary"} isPending={reading} isDisabled={pending} onPress={() => inputRef.current?.click()}>
          {preview ? "Escolher outra foto" : user.avatarUrl ? "Trocar foto" : "Escolher foto"}
        </Button>
        {preview && (
          <Button isPending={pending} onPress={save}>
            Salvar foto
          </Button>
        )}
        {!preview && user.avatarUrl && (
          <Button variant="danger-soft" isPending={pending} onPress={remove}>
            Remover foto
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ endereços -------------------------------- */
const EMPTY_ADDRESS = {
  label: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  isDefault: false,
};

function AddressCard({ address, busy, onEdit, onMakeDefault, onDelete }) {
  return (
    <div className="grid gap-3 rounded-2xl bg-overlay p-4">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin size={18} className="shrink-0" />
          <h3 className="font-semibold">{address.label || "Endereço"}</h3>
          {address.isDefault && (
            <Chip size="sm" color="accent" variant="soft">
              Principal
            </Chip>
          )}
        </div>
        <p className="text-sm">
          {address.street}, {address.number}
          {address.complement ? ` - ${address.complement}` : ""}
        </p>
        <p className="text-sm text-muted">
          {address.neighborhood} · {address.city}/{address.state} · CEP {formatCep(address.zipCode)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!address.isDefault && (
          <Button size="sm" variant="tertiary" isDisabled={busy} onPress={() => onMakeDefault(address)}>
            Tornar principal
          </Button>
        )}
        <Button size="sm" variant="tertiary" isDisabled={busy} onPress={() => onEdit(address)}>
          <Pencil size={14} />
          Editar
        </Button>
        <Button size="sm" variant="danger-soft" isDisabled={busy} onPress={() => onDelete(address)}>
          <Trash2 size={14} />
          Remover
        </Button>
      </div>
    </div>
  );
}

function AddressForm({ address, isFirst, onCancel, onSaved }) {
  const isEdit = !!address?.id;
  const [form, setForm] = useState(() => (isEdit ? { ...EMPTY_ADDRESS, ...address, complement: address.complement ?? "", label: address.label ?? "" } : EMPTY_ADDRESS));
  const [cepNote, setCepNote] = useState("");
  const { pending, error, setError, run } = useAction();
  const lookupId = useRef(0);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  // Ao completar o CEP, tenta preencher rua/bairro/cidade/UF (ViaCEP). Se falhar, o cliente digita.
  const onCepChange = async (value) => {
    const masked = formatCep(value);
    setForm((f) => ({ ...f, zipCode: masked }));
    setCepNote("");
    const digits = onlyDigits(masked);
    if (digits.length !== 8) return;

    const id = ++lookupId.current;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (id !== lookupId.current) return; // chegou outra consulta depois
      if (data.erro) return setCepNote("CEP não encontrado. Preencha o endereço manualmente.");
      setForm((f) => ({
        ...f,
        street: f.street || data.logradouro || "",
        neighborhood: f.neighborhood || data.bairro || "",
        city: f.city || data.localidade || "",
        state: f.state || data.uf || "",
      }));
    } catch {
      /* sem internet ou serviço fora do ar: o cliente preenche à mão */
    }
  };

  const submit = () => {
    if (onlyDigits(form.zipCode).length !== 8) return setError("Informe o CEP com 8 números.");
    if (!form.street.trim() || !form.number.trim() || !form.neighborhood.trim() || !form.city.trim()) {
      return setError("Preencha rua, número, bairro e cidade.");
    }
    if (!form.state) return setError("Escolha o estado.");

    run(async () => {
      const body = { ...form, zipCode: onlyDigits(form.zipCode) };
      await (isEdit ? api.put(`/users/me/addresses/${address.id}`, body) : api.post("/users/me/addresses", body));
      onSaved(isEdit ? "Endereço atualizado." : "Endereço adicionado.");
    });
  };

  return (
    <FormCard onSubmit={submit}>
      <ErrorAlert message={error} />
      <Field label="Apelido (opcional)" placeholder="Casa, Trabalho…" value={form.label} onChange={set("label")} maxLength={30} />
      <Field
        label="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        value={form.zipCode}
        onChange={onCepChange}
        description={cepNote || undefined}
      />
      <Field label="Rua" autoComplete="address-line1" value={form.street} onChange={set("street")} maxLength={100} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Número" value={form.number} onChange={set("number")} maxLength={20} />
        <Field label="Complemento" value={form.complement} onChange={set("complement")} maxLength={60} />
      </div>
      <Field label="Bairro" value={form.neighborhood} onChange={set("neighborhood")} maxLength={100} />
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Cidade" autoComplete="address-level2" value={form.city} onChange={set("city")} maxLength={100} />
        <Select aria-label="Estado" placeholder="UF" value={form.state || null} onChange={(key) => set("state")(key ?? "")}>
          <Label>Estado</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {UFS.map((uf) => (
                <ListBox.Item key={uf} id={uf} textValue={uf}>
                  {uf}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {/* o primeiro endereço é sempre o principal; quem já é principal não pode "desmarcar" */}
      {!isFirst && !address?.isDefault && (
        <Switch isSelected={form.isDefault} onChange={set("isDefault")}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>Usar como endereço principal</Label>
          </Switch.Content>
        </Switch>
      )}

      <div className="grid gap-2">
        <SaveButton pending={pending}>{isEdit ? "Salvar alterações" : "Adicionar endereço"}</SaveButton>
        <Button variant="tertiary" isDisabled={pending} onPress={onCancel}>
          Cancelar
        </Button>
      </div>
    </FormCard>
  );
}

function AddressesSection({ editing, setEditing }) {
  const [addresses, setAddresses] = useState(null); // null = carregando
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setAddresses(await api.get("/users/me/addresses"));
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || "Não foi possível carregar seus endereços.");
      setAddresses((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (message) notify(message);
    } catch (err) {
      notify(err.message || "Não foi possível concluir.", "danger");
    } finally {
      setBusy(false);
    }
  };

  if (addresses === null) return <p className="py-8 text-center text-muted">Carregando endereços…</p>;

  if (editing) {
    return (
      <AddressForm
        address={editing === "new" ? null : editing}
        isFirst={addresses.length === 0}
        onCancel={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          await load();
          notify(message);
        }}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <ErrorAlert message={loadError} />

      {addresses.length === 0 && !loadError && (
        <div className="grid justify-items-center gap-2 rounded-2xl bg-overlay px-4 py-10 text-center">
          <MapPinned className="text-muted" />
          <p className="font-semibold">Nenhum endereço cadastrado</p>
          <p className="text-sm text-muted">Adicione um endereço para facilitar seus próximos agendamentos.</p>
        </div>
      )}

      {addresses.map((a) => (
        <AddressCard
          key={a.id}
          address={a}
          busy={busy}
          onEdit={setEditing}
          onMakeDefault={(addr) => act(() => api.patch(`/users/me/addresses/${addr.id}/default`), "Endereço principal atualizado.")}
          onDelete={setToDelete}
        />
      ))}

      {addresses.length < 10 ? (
        <Button variant="secondary" className="w-full" onPress={() => setEditing("new")}>
          <Plus size={16} />
          Adicionar endereço
        </Button>
      ) : (
        <p className="text-center text-sm text-muted">Limite de 10 endereços atingido.</p>
      )}

      <AlertDialog>
        <AlertDialog.Backdrop variant="blur" isKeyboardDismissDisabled={false} isOpen={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-100">
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Remover endereço?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-muted">
                  {toDelete?.street}, {toDelete?.number} - {toDelete?.city}/{toDelete?.state}
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancelar
                </Button>
                <Button
                  slot="close"
                  variant="danger"
                  onPress={() => {
                    const target = toDelete;
                    act(() => api.delete(`/users/me/addresses/${target.id}`), "Endereço removido.");
                  }}
                >
                  Remover
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------ seções ----------------------------------- */
// chave da URL (?editar=...) -> título da barra e ícone
const SECTIONS = {
  nome: { title: "Nome e e-mail", icon: UserRound },
  telefone: { title: "Telefone", icon: Phone },
  nascimento: { title: "Data de nascimento", icon: Cake },
  senha: { title: "Alterar senha", icon: LockKeyhole },
  enderecos: { title: "Endereços", icon: MapPinned },
  notificacoes: { title: "Notificações", icon: BellRing },
  foto: { title: "Foto de perfil", icon: Pencil },
};

// Cartão do topo: foto + e-mail. Toque = editar a foto.
function AvatarHeader({ user, loading, isPhotoPage, onPress }) {
  return (
    <div className="h-auto rounded-2xl bg-overlay">
      <Button
        variant="tertiary"
        className="flex h-30 w-full items-center justify-between rounded-2xl bg-overlay p-4"
        onPress={isPhotoPage ? undefined : onPress}
      >
        <div className="flex min-w-0 gap-4">
          <Badge.Anchor>
            <Avatar className="h-20 w-20 rounded-full">
              <Avatar.Image src={assetUrl(user?.avatarUrl)} alt="" />
              <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
            </Avatar>
            <Badge color="accent" placement="bottom-right" size="lg" className="h-10 w-10 text-white">
              <Pencil size={12} />
            </Badge>
          </Badge.Anchor>
          <div className="grid min-w-0 items-center">
            <h2 className="flex justify-start font-semibold">{isPhotoPage ? user?.name : "Edite sua foto"}</h2>
            <span className="truncate text-muted">{loading ? "" : user?.email}</span>
          </div>
        </div>
        {!isPhotoPage && <ChevronRight />}
      </Button>
    </div>
  );
}

export default function Account() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, loading, updateUser } = useAuth();
  const [addressEditing, setAddressEditing] = useState(null); // null | "new" | endereço

  const sectionKey = params.get("editar");
  const section = SECTIONS[sectionKey] ? sectionKey : null;
  const openSection = (key) => setParams({ editar: key });

  // Depois de salvar: atualiza o usuário do app (sem perder o que a API não devolve,
  // como os favoritos), avisa e volta para o Perfil, a não ser que a tela peça para ficar
  const onSaved = (updated, message, { stay = false } = {}) => {
    updateUser({ ...user, ...updated });
    notify(message);
    if (!stay) navigate(-1);
  };

  const inAddressForm = section === "enderecos" && addressEditing;
  const title = inAddressForm ? (addressEditing === "new" ? "Novo endereço" : "Editar endereço") : (SECTIONS[section]?.title ?? "Conta");
  const goBack = () => (inAddressForm ? setAddressEditing(null) : navigate(-1));

  let content;
  if (loading || !user) {
    content = <p className="py-8 text-center text-muted">Carregando…</p>;
  } else if (section === "nome") {
    content = <NameForm user={user} onSaved={onSaved} />;
  } else if (section === "telefone") {
    content = <PhoneForm user={user} onSaved={onSaved} />;
  } else if (section === "nascimento") {
    content = <BirthdateForm user={user} onSaved={onSaved} />;
  } else if (section === "senha") {
    content = <PasswordForm onDone={(message) => onSaved({}, message)} />;
  } else if (section === "notificacoes") {
    content = <NotificationsForm user={user} onSaved={onSaved} />;
  } else if (section === "foto") {
    content = <PhotoForm user={user} onSaved={onSaved} />;
  } else if (section === "enderecos") {
    content = <AddressesSection editing={addressEditing} setEditing={setAddressEditing} />;
  } else {
    // sem ?editar= (ou com um valor desconhecido): atalhos para tudo que dá para editar
    content = (
      <div className="grid gap-2 rounded-2xl bg-overlay p-2">
        {Object.entries(SECTIONS)
          .filter(([key]) => key !== "foto")
          .map(([key, { title: label, icon: Icon }]) => (
            <Button key={key} variant="tertiary" className="flex h-14 w-full items-center justify-between" onPress={() => openSection(key)}>
              <span className="flex items-center gap-2">
                <Icon size={18} />
                {label}
              </span>
              <ChevronRight size={16} />
            </Button>
          ))}
      </div>
    );
  }

  const showHeader = !section || section === "nome" || section === "foto";

  return (
    <div className="mx-6 flex h-full flex-col pb-20 pt-12">
      <MobileNav onBack={goBack} title={title} />
      <main className="grid flex-1 content-start gap-4 overflow-y-auto pb-24 pt-14">
        {showHeader && <AvatarHeader user={user} loading={loading} isPhotoPage={section === "foto"} onPress={() => openSection("foto")} />}
        {content}
      </main>
    </div>
  );
}
