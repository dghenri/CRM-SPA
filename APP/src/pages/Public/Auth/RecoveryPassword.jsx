import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../../../api/api";
import AuthCard from "../../../components/AuthCard";
import { validateEmail } from "../../../utils/validators";

import { Button, FieldError, Input, Label, Spinner, TextField, toast } from "@heroui/react";
import { MailCheck } from "lucide-react";

const RESEND_SECONDS = 60;

/**
 * Pede o link de recuperação de senha.
 *  - Veio do login com um e-mail válido digitado: mostra o e-mail e um botão para enviar
 *    (não envia sozinho: abrir a página sem querer não dispara e-mail).
 *  - Sem e-mail (ou inválido): mostra o campo para digitar.
 *  - Depois de enviar: mensagem neutra (não revela se o e-mail tem conta) e reenvio com espera.
 */
export default function RecoveryPassword() {
  const location = useLocation();
  const incomingEmail = String(location.state?.email ?? "").trim();
  const accountType = location.state?.accountType; // "cliente" | "colaborador" | undefined

  const hasValidIncoming = !validateEmail(incomingEmail);
  const [email, setEmail] = useState(hasValidIncoming ? incomingEmail : "");
  const [useIncoming, setUseIncoming] = useState(hasValidIncoming);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState(""); // e-mail para o qual o pedido foi feito
  const [cooldown, setCooldown] = useState(0);
  const statusRef = useRef(null);

  // contagem regressiva do reenvio
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // depois de enviar, leva o foco para a confirmação (leitores de tela anunciam)
  useEffect(() => {
    if (sentTo) statusRef.current?.focus();
  }, [sentTo]);

  const send = async () => {
    const target = email.trim();
    const message = validateEmail(target);
    setError(message);
    if (message) return;

    setIsSending(true);
    try {
      await api.post("/auth/password/forgot", { email: target, accountType });
      setSentTo(target);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      toast.danger("Não foi possível enviar", {
        description: err.message || "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setIsSending(false);
    }
  };

  /* ------------------------------ enviado ------------------------------ */
  if (sentTo) {
    return (
      <AuthCard title="Verifique seu e-mail" documentTitle="Recuperar senha">
        <div ref={statusRef} tabIndex={-1} role="status" className="flex flex-col items-center gap-4 text-center outline-none">
          <div className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
            <MailCheck className="size-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">
            Se existir uma conta com <strong className="break-all">{sentTo}</strong>, enviamos um link para redefinir a senha.
            O link vale por 30 minutos.
          </p>
          <p className="text-xs text-field-placeholder">Não achou? Olhe também a caixa de spam.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="tertiary" className="w-full" isDisabled={cooldown > 0 || isSending} onPress={send}>
            {isSending ? <Spinner size="sm" /> : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar link"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onPress={() => {
              setSentTo("");
              setUseIncoming(false);
              setEmail("");
            }}
          >
            Usar outro e-mail
          </Button>
        </div>
      </AuthCard>
    );
  }

  /* ------------------------------ e-mail já informado ------------------------------ */
  if (useIncoming) {
    return (
      <AuthCard
        title="Esqueceu a senha?"
        subtitle="Enviaremos um link para redefinir a senha deste e-mail:"
        documentTitle="Recuperar senha"
      >
        <p className="break-all rounded-xl bg-surface-secondary p-4 text-center font-semibold">{email}</p>

        <div className="flex flex-col gap-2">
          <Button color="primary" size="lg" className="w-full p-6" isDisabled={isSending} onPress={send}>
            {isSending ? <Spinner className="size-6 text-white" /> : "Enviar link de recuperação"}
          </Button>
          <Button variant="ghost" className="w-full" isDisabled={isSending} onPress={() => setUseIncoming(false)}>
            Usar outro e-mail
          </Button>
        </div>
      </AuthCard>
    );
  }

  /* ------------------------------ digitar o e-mail ------------------------------ */
  return (
    <AuthCard
      title="Esqueceu a senha?"
      subtitle="Digite o e-mail da sua conta e enviaremos um link para redefinir a senha."
      documentTitle="Recuperar senha"
    >
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <TextField
          name="email"
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (error) setError("");
          }}
          isInvalid={!!error}
          validationBehavior="aria"
        >
          <Label>Email</Label>
          <Input
            autoFocus
            autoComplete="email"
            placeholder="nome@email.com"
            className="w-full text-base md:text-sm font-medium bg-surface-secondary hover:bg-surface-tertiary p-4"
          />
          <FieldError>{error}</FieldError>
        </TextField>

        <Button type="submit" color="primary" size="lg" className="w-full p-6" isDisabled={isSending}>
          {isSending ? <Spinner className="size-6 text-white" /> : "Enviar link de recuperação"}
        </Button>
      </form>
    </AuthCard>
  );
}
