import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../../api/api";
import AuthCard from "../../../components/AuthCard";
import PasswordStrength from "../../../components/PasswordStrength";
import { evaluatePassword, PASSWORD_MAX } from "../../../utils/passwordPolicy";

import { Button, Checkbox, FieldError, InputGroup, Label, Spinner, TextField, toast } from "@heroui/react";
import { Eye, EyeOff, LinkIcon } from "lucide-react";

/**
 * Página aberta pelo link do e-mail: /reset-password?token=...
 * O token é lido uma vez e retirado da barra de endereço (não fica no histórico/compartilhamento).
 */
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.search).get("token") ?? "");

  const [status, setStatus] = useState(token ? "checking" : "invalid"); // checking | valid | invalid
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  // por padrão encerra as sessões abertas em outros dispositivos (quem esqueceu a senha pode ter sido invadido)
  const [logoutAll, setLogoutAll] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // tira o token da URL e confere se o link ainda vale
  useEffect(() => {
    if (!token) return;
    navigate("/reset-password", { replace: true });

    let cancelled = false;
    api
      .post("/auth/password/reset/verify", { token })
      .then(() => !cancelled && setStatus("valid"))
      .catch(() => !cancelled && setStatus("invalid"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = evaluatePassword(password);
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = check.passed && password === confirm && !isSaving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    try {
      await api.post("/auth/password/reset", { token, password, logoutAllSessions: logoutAll });
      toast.success("Senha redefinida", { description: "Entre com a nova senha." });
      navigate("/auth/login", { replace: true });
    } catch (err) {
      toast.danger("Não foi possível redefinir", {
        description: err.message || "Tente novamente.",
      });
      // link gasto ou expirado: não adianta tentar de novo com ele
      if (/inválido|expirou/i.test(err.message ?? "")) setStatus("invalid");
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "checking") {
    return (
      <AuthCard title="Redefinir senha" documentTitle="Redefinir senha">
        <div className="flex items-center justify-center gap-2 py-6" role="status">
          <Spinner size="sm" />
          <p className="text-sm font-medium text-field-placeholder">Verificando o link</p>
        </div>
      </AuthCard>
    );
  }

  if (status === "invalid") {
    return (
      <AuthCard title="Link inválido ou expirado" documentTitle="Redefinir senha">
        <div role="alert" className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-danger/15 text-danger">
            <LinkIcon className="size-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Este link não vale mais. Os links duram 30 minutos e só podem ser usados uma vez.</p>
        </div>
        <Button color="primary" size="lg" className="w-full p-6" onPress={() => navigate("/recovery")}>
          Pedir um novo link
        </Button>
      </AuthCard>
    );
  }

  const toggle = (
    <InputGroup.Suffix className="pr-0">
      <Button
        isIconOnly
        aria-label={isVisible ? "Ocultar senha" : "Mostrar senha"}
        size="lg"
        variant="ghost"
        onPress={() => setIsVisible(!isVisible)}
        className="hover:bg-surface"
      >
        {isVisible ? <Eye className="size-6 text-muted" /> : <EyeOff className="size-6 text-muted" />}
      </Button>
    </InputGroup.Suffix>
  );

  return (
    <AuthCard title="Crie uma nova senha" subtitle="Escolha uma senha forte para a sua conta." documentTitle="Redefinir senha">
      <form noValidate className="flex flex-col gap-6" onSubmit={submit}>
        <TextField name="password" type="password" value={password} onChange={setPassword}>
          <Label>Nova senha</Label>
          <InputGroup className="justify-between bg-surface-secondary hover:bg-surface-tertiary p-2">
            <InputGroup.Input
              className="w-full font-medium text-base md:text-sm"
              type={isVisible ? "text" : "password"}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              autoFocus
            />
            {toggle}
          </InputGroup>
          <PasswordStrength password={password} />
        </TextField>

        <TextField
          name="confirmPassword"
          type="password"
          value={confirm}
          onChange={setConfirm}
          isInvalid={mismatch}
          validationBehavior="aria"
        >
          <Label>Confirme a nova senha</Label>
          <InputGroup className="justify-between bg-surface-secondary hover:bg-surface-tertiary p-2">
            <InputGroup.Input
              className="w-full font-medium text-base md:text-sm"
              type={isVisible ? "text" : "password"}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
            />
            {toggle}
          </InputGroup>
          <FieldError>As senhas não conferem.</FieldError>
        </TextField>

        <Checkbox isSelected={logoutAll} onChange={setLogoutAll}>
          <Checkbox.Content className="text-muted">
            <Checkbox.Control className="size-5 bg-surface-secondary border">
              <Checkbox.Indicator />
            </Checkbox.Control>
            Sair de todos os dispositivos conectados
          </Checkbox.Content>
        </Checkbox>

        <Button type="submit" color="primary" size="lg" className="w-full p-6" isDisabled={!canSubmit}>
          {isSaving ? <Spinner className="size-6 text-white" /> : "Redefinir senha"}
        </Button>
      </form>
    </AuthCard>
  );
}
