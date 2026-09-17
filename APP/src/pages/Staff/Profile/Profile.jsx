import { useState, useEffect } from "react";
import api from "../../../api/api";
import { parseDate } from "@internationalized/date";
import { useAuth } from "../../../context/AuthContext";

import {
  Avatar,
  Button,
  Card,
  Label,
  Input,
  InputGroup,
  Separator,
  DateField,
  Description,
  FieldError,
  Spinner,
  toast,
  Chip,
} from "@heroui/react";

import { Eye, EyeOff, UserRound, Pencil, CircleX } from "lucide-react";

// Gera as iniciais a partir do nome (ex: "Junior Garcia" -> "JG")
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
  const [isSaving, setIsSaving] = useState(false);

  // email e senha ficam "trancados" até o usuário clicar em Alterar -
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

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        birthdate: formData.birthdate ? formData.birthdate.toString() : undefined,
      };

      // só manda senha se alguém realmente digitou uma nova
      if (formData.password) {
        payload.password = formData.password;
      }

      const response = await api.put(`/users/${user.id}`, payload);

      updateUser(response.data);
      setFormData((prev) => ({ ...prev, password: "" }));
      setIsEditingEmail(false);
      setIsEditingPassword(false);
      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="w-full h-full p-2">
        <div className="mx-auto w-full">
        {/* ---------- Meu Perfil ---------- */}
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

        {/* ---------- Personal Info ---------- */}
        <h2 className="text-lg font-bold mt-15">Informações Pessoais</h2>
        <Separator className="mt-4 mb-6" />

        <div className="grid grid-cols-2 gap-6">
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="profile-name" className="text-muted">Nome</Label>
            <Input
              id="profile-name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="w-150 font-semibold border border-border"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-phone" className="text-muted">Telefone</Label>
            <Input
              id="profile-phone"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className="w-150 font-semibold border border-border"
            />
          </div>

          <DateField value={formData.birthdate} onChange={(v) => handleInputChange("birthdate", v)}>
            <Label htmlFor="profile-birthdate" className="text-muted">Data de nascimento</Label>
            <DateField.Group className="py-5 border border-border">
              <DateField.Input className="font-semibold">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
            </DateField.Group>
            <FieldError />
          </DateField>
        </div>

        {/* ---------- Account Security ---------- */}
        <h2 className="text-lg font-bold mt-18">Segurança da conta</h2>
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
                      aria-label={isVisible ? "Hide password" : "Show password"}
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

        {/* Actions */}
        <div className="flex justify-end mt-10">
          <Button
            variant="tertiary"
            onPress={handleSave}
            isDisabled={isSaving}
            className="fixed bottom-6 right-6 bg-field-foreground hover:bg-field-foreground/80 text-background p-6"
          >
            {isSaving ? <Spinner color="currentColor" className="size-5" /> : "Salvar"}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}
