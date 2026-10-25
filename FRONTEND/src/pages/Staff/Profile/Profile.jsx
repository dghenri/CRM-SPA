import { useState, useEffect } from "react";
import api from "../../../api/api";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { useAuth } from "../../../context/AuthContext";
import AvailabilityTab from "./AvailabilityTab";
import AvatarUploader from "../../../components/AvatarUploader";

import {
  Button,
  Calendar,
  Checkbox,
  Label,
  InputGroup,
  Separator,
  DateField,
  DatePicker,
  Description,
  I18nProvider,
  Spinner,
  Tabs,
  TextField,
  toast,
  Chip,
} from "@heroui/react";

import { Eye, EyeOff, Pencil, CircleX } from "lucide-react";

// ---- telefone: (DDD) 99999-9999 ----
const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

function formatPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// deixa o backspace funcionar: se só um caractere da máscara "(" ou "-" foi apagado,
// o que a pessoa quis foi apagar o último número
function maskedChange(next, previous, format) {
  const nextDigits = onlyDigits(next);
  const prevDigits = onlyDigits(previous);
  if (next.length < previous.length && nextDigits === prevDigits) return format(prevDigits.slice(0, -1));
  return format(nextDigits);
}

const MIN_BIRTHDATE = parseDate("1900-01-01");

const statusColorMap = {
  Active: "success",
  Inactive: "danger",
  OnLeave: "warning",
};

function formatLabel(text) {
  if (!text) return "";
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// true em telas menores que o breakpoint "md" do Tailwind (celular)
function useIsMobile() {
  const query = "(max-width: 767px)";
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export default function Profile() {
  const isMobile = useIsMobile();
  const { user, updateUser, login } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  // email e senha ficam "trancados" até o usuário clicar em Editar -
  // evita editar sem querer um dado sensível só de passar o olho na tela
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  // ao trocar a senha, desconecta os outros navegadores/aparelhos (marcado por padrão)
  const [logoutOthers, setLogoutOthers] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    birthdate: null,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        phone: formatPhone(user.phone),
        password: "",
        birthdate: user.birthdate ? parseDate(user.birthdate.split("T")[0]) : null,
      });
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const cancelEmailEdit = () => {
    setFormData((prev) => ({ ...prev, email: user?.email || "" }));
    setIsEditingEmail(false);
  };

  const cancelPasswordEdit = () => {
    setFormData((prev) => ({ ...prev, password: "" }));
    setIsEditingPassword(false);
  };

  // foto: o AvatarUploader entrega o JPEG já recortado; a API devolve o staff atualizado
  const handleSaveAvatar = async (blob) => {
    const form = new FormData();
    form.append("file", blob, "avatar.jpg");
    updateUser(await api.put("/staff/me/avatar", form));
    toast.success("Foto atualizada!");
  };

  const handleRemoveAvatar = async () => {
    updateUser(await api.delete("/staff/me/avatar"));
    toast.success("Foto removida.");
  };

  // cada aba salva só os próprios campos, na rota de funcionários (/staff)
  const updateStaff = async (payload) => {
    // o api.js já devolve o corpo da resposta (o staff atualizado)
    const updated = await api.put(`/staff/${user.id}`, payload);
    updateUser(updated);
    return updated;
  };

  const handleSaveInfo = async () => {
    if (!user?.id) return;

    const phoneDigits = onlyDigits(formData.phone);
    if (phoneDigits && phoneDigits.length < 10) {
      toast.error("Informe o telefone com DDD (10 ou 11 números).");
      return;
    }

    setIsSavingInfo(true);

    try {
      await updateStaff({
        name: formData.name,
        phone: phoneDigits ? formData.phone : "",
        birthdate: formData.birthdate ? formData.birthdate.toString() : undefined,
      });
      toast.success("Informações atualizadas com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar. Tente novamente.");
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleSaveSecurity = async () => {
    if (!user?.id) return;

    const payload = {};
    if (isEditingEmail) payload.email = formData.email;
    // só manda senha se alguém realmente digitou uma nova
    if (formData.password) payload.password = formData.password;

    if (Object.keys(payload).length === 0) {
      toast("Nada para salvar. Clique em Editar para alterar email ou senha.");
      return;
    }

    setIsSavingSecurity(true);
    try {
      const updated = await updateStaff(payload);
      const changedPassword = !!payload.password;
      setFormData((prev) => ({ ...prev, password: "" }));
      setIsEditingEmail(false);
      setIsEditingPassword(false);

      if (changedPassword && logoutOthers) {
        try {
          // invalida as outras sessões e devolve um token novo só para este navegador
          const { token } = await api.post("/auth/sessions/revoke-others");
          login(token, updated);
          toast.success("Segurança atualizada!", { description: "Os outros dispositivos foram desconectados." });
        } catch (revokeError) {
          console.error(revokeError);
          toast.warning("Senha alterada, mas não foi possível desconectar os outros dispositivos.");
        }
      } else {
        toast.success("Segurança atualizada com sucesso!");
      }
    } catch (error) {
      console.error(error);
      // o back-end manda mensagens úteis aqui (ex: email já em uso)
      toast.error(error.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setIsSavingSecurity(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <Spinner color="currentColor" className="size-6" />
        <p>Carregando informações</p>
      </div>
    );
  }

  const saveButtonClass =
    "bg-field-foreground hover:bg-field-foreground/80 text-background p-6 mt-8 fixed right-4 bottom-5 z-30 shadow-lg sm:right-8 sm:bottom-6";

  return (
    <div className="flex min-h-screen w-full flex-col p-2">
      <Tabs className="flex w-full flex-1 flex-col" variant="secondary">
        <Tabs.ListContainer className="sticky top-0 z-20 -mx-2 -mt-2 overflow-x-auto bg-overlay">
          <Tabs.List aria-label="Perfil">
            <Tabs.Tab id="profile">
              Meu perfil
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="availability">
              Disponibilidade
              <Tabs.Indicator />
            </Tabs.Tab>
            {/* <Tabs.Tab id="progress">
              Desenvolvimento
              <Tabs.Indicator />
            </Tabs.Tab> */}
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel className="flex flex-1 pt-4" id="profile">
          <Tabs className="flex w-full flex-col items-stretch md:-ml-4.5 md:flex-row" orientation={isMobile ? "horizontal" : "vertical"} variant="secondary">
            <Tabs.ListContainer className="md:self-stretch">
              <Tabs.List className="flex md:h-full md:flex-col md:space-y-10" aria-label="Seções do perfil">
                <Tabs.Tab id="personal-info">
                  Informações
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="security">
                  Segurança
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>

            {/* ---------- Aba: Informações ---------- */}
            <Tabs.Panel className="flex-1 px-1 pt-4 md:px-4 md:pt-0" id="personal-info">
              <h2 className="text-lg font-bold">Informações Pessoais</h2>
              <Separator className="mt-4 mb-6" />
              <div className="mb-10 flex items-center gap-4 sm:mb-18">
                <AvatarUploader
                  name={user.name}
                  avatarUrl={user.avatarUrl}
                  onSave={handleSaveAvatar}
                  onRemove={handleRemoveAvatar}
                />
              </div>


              <div className="flex flex-col gap-4">
                <TextField fullWidth className="max-w-2xl" value={formData.name} onChange={(v) => handleInputChange("name", v)}>
                  <Label className="text-muted">Nome</Label>
                  <InputGroup className="border border-border">
                    <InputGroup.Input className="font-semibold" />
                  </InputGroup>
                </TextField>

                {/* só leitura: o cargo e a profissão são alterados pelo Admin na tabela de funcionários */}
                <TextField fullWidth isReadOnly isDisabled className="max-w-70" value={[formatLabel(user.role), user.profession?.name].filter(Boolean).join(" · ")}>
                  <Label className="text-muted">Cargo</Label>
                  <InputGroup className="border border-border">
                    <InputGroup.Input className="font-semibold" />
                  </InputGroup>
                </TextField>

                <TextField
                  fullWidth
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  className="max-w-70"
                  value={formData.phone}
                  onChange={(v) =>
                    setFormData((prev) => ({ ...prev, phone: maskedChange(v, prev.phone, formatPhone) }))
                  }
                >
                  <Label className="text-muted">Telefone</Label>
                  <InputGroup className="border border-border">
                    <InputGroup.Input className="font-semibold" placeholder="(DDD) 99999-9999" />
                  </InputGroup>
                </TextField>

                <I18nProvider locale="pt-BR">
                  <DatePicker
                    className="max-w-70"
                    value={formData.birthdate}
                    onChange={(v) => handleInputChange("birthdate", v)}
                    minValue={MIN_BIRTHDATE}
                    maxValue={today(getLocalTimeZone())}
                  >
                    <Label className="text-muted">Data de nascimento</Label>
                    <DateField.Group fullWidth className="py-5 border border-border">
                      <DateField.Input className="font-semibold">
                        {(segment) => <DateField.Segment segment={segment} />}
                      </DateField.Input>
                      <DateField.Suffix>
                        <DatePicker.Trigger>
                          <DatePicker.TriggerIndicator />
                        </DatePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <Description>Digite a data ou toque no calendário.</Description>
                    <DatePicker.Popover>
                      <Calendar
                        aria-label="Data de nascimento"
                        className="w-full"
                        defaultFocusedValue={formData.birthdate ? undefined : parseDate("1990-01-01")}
                      >
                        <Calendar.Header className="w-full">
                          <Calendar.YearPickerTrigger>
                            <Calendar.YearPickerTriggerHeading />
                            <Calendar.YearPickerTriggerIndicator />
                          </Calendar.YearPickerTrigger>
                          <Calendar.NavButton slot="previous" />
                          <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid className="w-full">
                          <Calendar.GridHeader>
                            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                          </Calendar.GridHeader>
                          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                        </Calendar.Grid>
                        <Calendar.YearPickerGrid className="w-full">
                          <Calendar.YearPickerGridBody />
                        </Calendar.YearPickerGrid>
                      </Calendar>
                    </DatePicker.Popover>
                  </DatePicker>
                </I18nProvider>
              </div>

              <Button
                variant="tertiary"
                onPress={handleSaveInfo}
                isDisabled={isSavingInfo}
                className={saveButtonClass}
              >
                {isSavingInfo ? <><Spinner color="currentColor" /> Salvando</> : "Salvar"}
              </Button>
            </Tabs.Panel>

            {/* ---------- Aba: Segurança ---------- */}
            <Tabs.Panel className="flex-1 px-1 pt-4 md:px-4 md:pt-0" id="security">
              <h2 className="text-lg font-bold">Segurança da conta</h2>
              <Separator className="mt-4 mb-6" />

              <div className="flex flex-col gap-6">
                {/* Email */}
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <TextField
                    fullWidth
                    type="email"
                    className="w-full sm:w-150"
                    isDisabled={!isEditingEmail}
                    value={formData.email}
                    onChange={(v) => handleInputChange("email", v)}
                  >
                    <Label className="text-muted">Email</Label>
                    <InputGroup className="border border-border">
                      <InputGroup.Input className="font-semibold" />
                    </InputGroup>
                  </TextField>
                  <Button
                    variant="ghost"
                    onPress={() => (isEditingEmail ? cancelEmailEdit() : setIsEditingEmail(true))}
                  >
                    {isEditingEmail ? <><CircleX /> Cancelar</> : <><Pencil /> Editar</>}
                  </Button>
                </div>

                {/* Password */}
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <TextField
                    fullWidth
                    type={isVisible ? "text" : "password"}
                    className="w-full sm:w-150"
                    isDisabled={!isEditingPassword}
                    value={formData.password}
                    onChange={(v) => handleInputChange("password", v)}
                  >
                    <Label className="text-muted">Senha</Label>
                    <InputGroup className="flex justify-between border border-border">
                      <InputGroup.Input
                        className="font-semibold"
                        placeholder={isEditingPassword ? "Digite a nova senha" : "••••••••••••"}
                      />
                      {isEditingPassword && (
                        <InputGroup.Suffix className="pr-0">
                          <Button
                            isIconOnly
                            aria-label={isVisible ? "Ocultar senha" : "Mostrar senha"}
                            size="lg"
                            variant="ghost"
                            onPress={() => setIsVisible(!isVisible)}
                          >
                            {isVisible ? <Eye className="size-6 text-muted" /> : <EyeOff className="size-6 text-muted" />}
                          </Button>
                        </InputGroup.Suffix>
                      )}
                    </InputGroup>
                  </TextField>
                  <Button
                    variant="ghost"
                    onPress={() => (isEditingPassword ? cancelPasswordEdit() : setIsEditingPassword(true))}
                  >
                    {isEditingPassword ? <><CircleX /> Cancelar</> : <><Pencil /> Editar</>}
                  </Button>
                </div>

                {/* só faz sentido ao trocar a senha */}
                {isEditingPassword && (
                  <Checkbox isSelected={logoutOthers} onChange={setLogoutOthers}>
                    <Checkbox.Content className="text-muted">
                      <Checkbox.Control className="size-5 bg-surface-secondary border">
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      Sair de outros dispositivos
                    </Checkbox.Content>
                  </Checkbox>
                )}
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  variant="tertiary"
                  onPress={handleSaveSecurity}
                  isDisabled={isSavingSecurity}
                  className={saveButtonClass}
                >
                  {isSavingSecurity ? <><Spinner color="currentColor" /> Salvando...</> : "Salvar"}
                </Button>
              </div>
            </Tabs.Panel>
          </Tabs>
        </Tabs.Panel>

        {/* ---------- Aba: Disponibilidade ---------- */}
        <Tabs.Panel className="px-1 pt-4 md:px-4" id="availability">
          <AvailabilityTab staffId={user.id} />
        </Tabs.Panel>

        {/* ---------- Aba: Desenvolvime0nto ---------- */}
        {/* <Tabs.Panel className="pt-4 px-4" id="progress">
          <h1>Desenvolvimento do funcionário</h1>
        </Tabs.Panel> */}
      </Tabs>
    </div>
  );
}
