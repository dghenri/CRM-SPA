import React, { useEffect, useState, useRef } from 'react'
import Carousel from "../../../components/Carousel";
import { Link, useNavigate } from "react-router-dom";
import api from '../../../api/api';
import { useAuth } from "../../../context/AuthContext";
import { decodeToken } from "../../../utils/jwt";
import formatCpf, { isValidCpf } from "../../../utils/formatCpf"
import formatName from "../../../utils/formatName"
import { validateEmail } from "../../../utils/validators";
import { evaluatePassword, PASSWORD_MAX } from "../../../utils/passwordPolicy";
import PasswordStrength from "../../../components/PasswordStrength";

import {
  Card,
  Button,
  InputGroup,
  Label,
  TextField,
  FieldError,
  Spinner,
  Input,
  Form,
  toast,
} from "@heroui/react"

import {
  Eye,
  EyeOff,
  Mail,
  Check,
  ChevronLeft,
} from 'lucide-react';

// Quanto tempo esperar com a tela verde tomada antes de navegar pro login -
// dá tempo do check aparecer e "assentar" antes do corte de tela.
const SUCCESS_OVERLAY_DURATION = 1500;

export default function Register() {
  const [isVisible, setIsVisible] = useState(false);
  const submitButtonRef = useRef();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Animação de sucesso: o botão vira verde e "cresce" até cobrir a tela
  // inteira (clip-path circular crescendo a partir do centro do próprio
  // botão), com um check aparecendo no meio. A navegação pro login acontece
  // só depois, já com a tela verde cobrindo tudo.
  const [isSuccess, setIsSuccess] = useState(false);
  const [isOverlayExpanded, setIsOverlayExpanded] = useState(false);
  const [overlayOrigin, setOverlayOrigin] = useState({ x: 50, y: 50 });

  const navigate = useNavigate();
  const { token, loading } = useAuth();

  useEffect(() => {
    document.title = "Cadastro | Viva Bem SPA";
    document.body.style.backgroundColor = 'var(--overlay)';

    // limpa a cor ao sair da página
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);
  // Se já existir uma sessão válida, não faz sentido mostrar o cadastro -
  // manda direto pra área certa (staff ou cliente)
  useEffect(() => {
    if (loading || !token) return;

    const decoded = decodeToken(token);
    navigate(decoded?.type === "staff" ? '/staff/dashboard' : '/user', { replace: true });
  }, [loading, token, navigate]);

  // requisitos da senha, reavaliados a cada tecla (também olham nome e e-mail digitados)
  const passwordCheck = evaluatePassword(password, { name, email });
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formattedName = formatName(name.trim());
    const trimmedEmail = email.trim();
    const cpfDigits = cpf.replace(/\D/g, "");

    // e-mail: mensagem própria (em vez da do navegador) logo no campo
    const emailMessage = validateEmail(trimmedEmail);
    setEmailError(emailMessage);

    if (!formattedName || !cpfDigits || !password) {
      toast.danger("Dados incompletos", {
        description: "Preencha nome, CPF, email e senha.",
      });
      return;
    }
    if (emailMessage) return;

    if (!isValidCpf(cpfDigits)) {
      toast.danger("CPF inválido", {
        description: "Confira o CPF informado e tente novamente.",
      });
      return;
    }

    if (!passwordCheck.passed) {
      toast.danger("Senha fraca", {
        description: "Atenda a todos os requisitos da senha antes de continuar.",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast.danger("Senhas não conferem", {
        description: "A confirmação precisa ser igual à senha digitada.",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Progressive Profiling: nessa primeira etapa só coletamos o essencial
      // (nome, CPF, email e senha). O restante do perfil (telefone, gênero,
      // data de nascimento) é completado depois, já com a conta criada.
      // O nome já sai formatado (só a inicial de cada palavra maiúscula,
      // ex: "João da SILVA" -> "João da Silva") pra não salvar tudo em
      // caixa alta/baixa do jeito que o usuário digitou.
      const data = {
        name: formattedName,
        cpf: cpfDigits,
        email: trimmedEmail,
        password,
      };

      await api.post('/auth/user/register', data);

      // dispara a animação de sucesso a partir do centro do botão
      const rect = submitButtonRef.current?.getBoundingClientRect?.();
      if (rect) {
        setOverlayOrigin({
          x: ((rect.left + rect.width / 2) / window.innerWidth) * 100,
          y: ((rect.top + rect.height / 2) / window.innerHeight) * 100,
        });
      }

      setIsLoading(false);
      setIsSuccess(true);

      // precisa de dois frames: um pra pintar o clip-path em 0% (ponto de
      // partida) e só no outro trocar pro valor final, senão o navegador
      // nem chega a animar a transição (já nasce no tamanho final)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsOverlayExpanded(true));
      });

      toast.success("Conta criada", {
        description: "Agora é só entrar com seu email e senha.",
      });

      // navega só depois da tela verde já estar cobrindo tudo - a troca de
      // tela acontece "atrás" do overlay, escondida do usuário
      setTimeout(() => {
        navigate("/auth/login");
      }, SUCCESS_OVERLAY_DURATION);
    } catch (error) {
      setIsLoading(false);
      toast.danger("Erro ao criar conta", {
        description: error.message || "Não foi possível criar a conta. Tente novamente.",
      });
    }
  };

  return (
    <Form onSubmit={handleSubmit} validationBehavior="aria" noValidate>
      <div className="h-dvh bg-overlay justify-center gap-2 p-4 md:grid md:grid-cols-4">

        {/* Left column */}
        <div className="md:hidden">
          {/* Voltar */}
          <Link
            to="/"
            className="flex absolute top-6 left-8 items-center gap-2 text-sm font-semibold text-field-placeholder hover:text-foreground hover:underline transition-colors"
          >
            <ChevronLeft size={16} /> Voltar
          </Link>
        </div>

        <div className="flex justify-center items-center gap-2 md:hidden mt-20">
          <img className="size-25" src="/LotusIcon.svg" alt="" />
          <h1 className="text-2xl font-bold text-brand">Viva Bem SPA</h1>
        </div>

        <div className="hidden md:col-span-2 md:block md:h-full">
          <Card className="relative h-full overflow-hidden rounded-3xl p-0">
            <Carousel />
          </Card>
        </div>

        {/* Right column */}
        <div className="relative col-span-2 flex items-center justify-center overflow-y-auto rounded-3xl">

          {/* Voltar */}
          <Link
            to="/"
            className="hidden md:flex absolute top-6 left-8 items-center gap-2 text-sm font-semibold text-field-placeholder hover:text-foreground hover:underline transition-colors"
          >
            <ChevronLeft size={16} /> Voltar
          </Link>

          <div className="w-full max-w-sm space-y-6 mt-20 mb-10 md:mb-0">
            {/* Header */}
            <div className="space-y-2 text-center mb-10 md:mb-18">
              <h1 className="text-2xl font-bold sm:text-3xl">Crie sua conta SPA</h1>

              <span
                className="flex justify-center font-semibold text-sm lg:text-base text-field-placeholder gap-2"
              > Já tem uma conta?
                <Link
                  to="/auth/login"
                  className="text-brand hover:underline"
                >
                  Entrar
                </Link>
              </span>
            </div>

            {/*-------------------------------------------------------------- INPUT GROUP */}
            {/* Progressive Profiling: aqui coletamos só o essencial (nome, CPF,
                email e senha) pra finalizar a criação da conta. Telefone, gênero
                e data de nascimento são preenchidos depois, com a conta já criada. */}
            <div className="space-y-6 p-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="input-type-name">Nome completo</Label>
                <Input
                  id="input-type-name"
                  aria-label="Name"
                  placeholder="Ex: Anakin Skywalker"
                  className="bg-surface-secondary hover:bg-surface-tertiary font-medium text-base md:text-sm p-4"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="input-type-cpf">CPF</Label>
                <Input
                  id="input-type-cpf"
                  aria-label="CPF"
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  value={cpf}
                  className="bg-surface-secondary hover:bg-surface-tertiary font-medium text-base md:text-sm p-4"
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                />
              </div>

              {/* Email */}
              <TextField
                name="email"
                type="email"
                value={email}
                onChange={(value) => {
                  setEmail(value);
                  if (emailError) setEmailError("");
                }}
                isInvalid={!!emailError}
                validationBehavior="aria"
              >
                <Label>Email</Label>
                <Input
                  autoComplete="email"
                  className="w-full text-base md:text-sm font-medium bg-surface-secondary hover:bg-surface-tertiary p-4"
                  placeholder="nome@email.com"
                />
                <FieldError>{emailError}</FieldError>
              </TextField>

              {/* Password */}
              <TextField className="w-full" name="password" type="password" value={password} onChange={setPassword}>
                <Label>Senha</Label>

                <InputGroup className="justify-between bg-surface-secondary hover:bg-surface-tertiary p-2">
                  <InputGroup.Input
                    className="w-full font-medium text-base md:text-sm"
                    placeholder="Crie sua senha"
                    type={isVisible ? "text" : "password"}
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX}
                  />

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
                </InputGroup>

                {/* barra de força + requisitos, atualizados a cada tecla */}
                <PasswordStrength password={password} name={name} email={email} />
              </TextField>

              {/* Confirm password */}
              <TextField
                className="w-full"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                isInvalid={passwordsMismatch}
                validationBehavior="aria"
              >
                <Label>Confirme sua senha</Label>

                <InputGroup className="justify-between bg-surface-secondary hover:bg-surface-tertiary p-2">
                  <InputGroup.Input
                    className="w-full font-medium text-base md:text-sm"
                    placeholder="Repita sua senha"
                    type={isVisible ? "text" : "password"}
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX}
                  />

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
                </InputGroup>
                <FieldError>As senhas não conferem.</FieldError>
              </TextField>
            </div>

            {/* Submit */}
            <Button
              ref={submitButtonRef}
              type="submit"
              color={isSuccess ? "success" : "primary"}
              className="w-full p-6 transition-colors duration-300"
              size="lg"
              isDisabled={isLoading || isSuccess}
            >
              {isLoading ? (
                <Spinner className="size-6 text-white" />
              ) : isSuccess ? (
                <Check className="size-6 text-white" strokeWidth={3} />
              ) : (
                "Criar conta"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Overlay de sucesso: cresce em círculo a partir do botão "Criar
          conta" até cobrir a tela inteira, com um check pulsando no centro.
          A navegação pro login acontece só depois disso, "atrás" da tela
          verde - o usuário nunca vê o formulário sumir, só o verde tomando
          conta e depois o login já carregado. */}
      {isSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-success transition-[clip-path] duration-500 ease-out"
          style={{
            clipPath: isOverlayExpanded
              ? `circle(150% at ${overlayOrigin.x}% ${overlayOrigin.y}%)`
              : `circle(0% at ${overlayOrigin.x}% ${overlayOrigin.y}%)`,
          }}
        >
          <div
            className={`flex size-24 items-center justify-center rounded-full bg-white/15 transition-all duration-400 ease-out ${
              isOverlayExpanded ? "scale-100 opacity-100 delay-300" : "scale-0 opacity-0"
            }`}
          >
            <Check className="size-14 text-white" strokeWidth={3} />
          </div>
        </div>
      )}
    </Form>
  )
}
