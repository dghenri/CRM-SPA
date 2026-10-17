import { useState, useEffect } from "react";
import api from "../../../api/api";
import { parseDate } from "@internationalized/date";
import { useAuth } from "../../../context/AuthContext";
import AvailabilityTab from "./AvailabilityTab";

import {
  Avatar,
  Button,
  Calendar,
  Label,
  Input,
  InputGroup,
  Separator,
  DateField,
  DatePicker,
  FieldError,
  TextField,
  Spinner,
  Tabs,
  toast,
  Chip,
} from "@heroui/react";

import { Eye, EyeOff, UserRound, Pencil, CircleX } from "lucide-react";

function getInitials(name) {
  if (!name) return "";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

const statusColorMap = {
  Active: "success",
  Inactive: "danger",
  OnLeave: "warning",
};

function formatLabel(text) {
  if (!text) return "";
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  // email e senha ficam "trancados" até o usuário clicar em Editar -
  // evita editar sem querer um dado sensível só de passar o olho na tela
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);

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
        phone: user.phone || "",
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

  // cada aba salva só os próprios campos, na rota de funcionários (/staff)
  const updateStaff = async (payload) => {
    // o api.js já devolve o corpo da resposta (o staff atualizado)
    const updated = await api.put(`/staff/${user.id}`, payload);
    updateUser(updated);
  };

  const handleSaveInfo = async () => {
    if (!user?.id) return;
    setIsSavingInfo(true);

    try {
      await updateStaff({
        name: formData.name,
        phone: formData.phone,
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
      await updateStaff(payload);
      setFormData((prev) => ({ ...prev, password: "" }));
      setIsEditingEmail(false);
      setIsEditingPassword(false);
      toast.success("Segurança atualizada com sucesso!");
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
    "bg-field-foreground hover:bg-field-foreground/80 text-background p-6 mt-8 fixed right-8 bottom-6";

  return (
    <div className="flex min-h-screen w-full flex-col p-2">
      <Tabs className="flex w-full flex-1 flex-col" variant="secondary">
        <Tabs.ListContainer className="sticky top-0 z-20 bg-overlay -mx-2 -mt-2">
          <Tabs.List aria-label="Perfil">
            <Tabs.Tab id="profile">
              Meu perfil
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="availability">
              Disponibilidade
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="progress">
              Desenvolvimento
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel className="flex flex-1 pt-4" id="profile">
          <Tabs className="flex w-full items-stretch -ml-4.5" orientation="vertical" variant="secondary">
            <Tabs.ListContainer className="self-stretch">
              <Tabs.List className="flex h-full flex-col space-y-10" aria-label="Seções do perfil">
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
            <Tabs.Panel className="flex-1 px-4" id="personal-info">
              <div className="flex items-center gap-4 mb-18">
                <Avatar size="lg">
                  <Avatar.Image src={/* "user.image_url" */ "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg"} />
                  <Avatar.Fallback>
                    {getInitials(user.name) || <UserRound className="size-6" />}
                  </Avatar.Fallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <div className="flex items-center gap-1">
                    <Chip className="mt-1" color={statusColorMap[user.status]} size="sm" variant="soft">
                      {formatLabel(user.status)}
                    </Chip>
                    <span className="text-muted">•</span>
                    <p className="text-sm text-muted font-semibold">{formatLabel(user.role)}</p>
                  </div>
                </div>
              </div>

              <h2 className="text-lg font-bold mt-15">Informações Pessoais</h2>
              <Separator className="mt-4 mb-6" />

              <div className="flex flex-col gap-">
                <Label htmlFor="profile-name" className="text-muted">Nome</Label>
                <Input
                  id="profile-name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="max-w-2xl font-semibold border border-border"
                />

                <Label htmlFor="profile-phone" className="text-muted">Telefone</Label>
                <Input
                  id="profile-phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="max-w-70 font-semibold border border-border"
                />
                
                <DateField value={formData.birthdate} onChange={(v) => handleInputChange("birthdate", v)}>
                  <Label htmlFor="profile-birthdate" className="text-muted">Data de nascimento</Label>
                  <DateField.Group className="max-w-70 py-5 border border-border">
                    <DateField.Input className="font-semibold">
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                  </DateField.Group>
                  <FieldError />
                </DateField>
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
            <Tabs.Panel className="flex-1 px-4" id="security">
              <h2 className="text-lg font-bold">Segurança da conta</h2>
              <Separator className="mt-4 mb-6" />

              <div className="flex flex-col gap-6">
                {/* Email */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="profile-email" className="text-muted">Email</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="profile-email"
                      type="email"
                      disabled={!isEditingEmail}
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      className="flex w-150 font-semibold border border-border"
                    />
                    <Button
                      variant="ghost"
                      onPress={() =>
                        isEditingEmail ? cancelEmailEdit() : setIsEditingEmail(true)
                      }
                    >
                      {isEditingEmail ? <><CircleX /> Cancelar</> : <><Pencil /> Editar</>}
                    </Button>
                  </div>
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="profile-password" className="text-muted">Senha</Label>
                  <div className="flex items-center gap-3">
                    <InputGroup className="flex w-150 justify-between border border-border">
                      <InputGroup.Input
                        id="profile-password"
                        type={isVisible ? "text" : "password"}
                        disabled={!isEditingPassword}
                        placeholder={isEditingPassword ? "Digite a nova senha" : "••••••••••••"}
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        className="font-semibold"
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
                    <Button
                      variant="ghost"
                      onPress={() =>
                        isEditingPassword ? cancelPasswordEdit() : setIsEditingPassword(true)
                      }
                    >
                      {isEditingPassword ? <><CircleX /> Cancelar</> : <><Pencil /> Editar</>}
                    </Button>
                  </div>
                </div>
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
        <Tabs.Panel className="pt-4 px-4" id="availability">
          <AvailabilityTab staffId={user.id} />
        </Tabs.Panel>

        {/* ---------- Aba: Desenvolvimento ---------- */}
        <Tabs.Panel className="pt-4 px-4" id="progress">
          <h1>Desenvolvimento do funcionário</h1>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
