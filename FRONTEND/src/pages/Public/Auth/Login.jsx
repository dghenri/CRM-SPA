import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from "react-router-dom";
import api from "../../../api/api"
import { useAuth } from "../../../context/AuthContext";
import { decodeToken } from "../../../utils/jwt";
import { validateEmail, PASSWORD_REQUIRED_MESSAGE } from "../../../utils/validators";

import Carousel from "../../../components/Carousel";

import {
  Card,
  Button,
  InputGroup,
  Label,
  TextField,
  FieldError,
  Spinner,
  Checkbox,
  Description,
  Form,
  Input,
  Tabs,
  toast,
} from "@heroui/react"

import {
  Eye,
  EyeOff,
  Mail,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberUser, setRememberUser] = useState(false)
  const [isLoading, setLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false);
  // mensagens de erro de cada campo (vazio = sem erro)
  const [errors, setErrors] = useState({ email: "", password: "" });
  // Controla qual aba está ativa, pra sabermos qual rota de login chamar
  const [accountType, setAccountType] = useState("cliente");
  const navigate = useNavigate();
  const { login, user, token, loading } = useAuth();

  useEffect(() => {
    document.title = "Login | Viva Bem SPA";
    document.body.style.backgroundColor = 'var(--overlay)'; 

    // limpa a cor ao sair da página
    return () => {
      document.body.style.backgroundColor = ''; 
    };
  }, []);

  // Se já existir uma sessão válida, redireciona direto para a área
  // certa (staff ou cliente) sem exibir o formulário de login.
  // Espera "loading" terminar - até lá o AuthContext ainda pode
  // descobrir que o token salvo é inválido e limpá-lo.
  useEffect(() => {
    if (loading || !token) return;

    const decoded = decodeToken(token);
    if (decoded?.type === "staff") {
      navigate('/staff', { replace: true });
    } else if (decoded?.type === "user") {
      navigate('/user', { replace: true });
    }
  }, [loading, user, token, navigate]);

  const handleEmailChange = (value) => {
    setEmail(value);
    if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
  };

  const handlePasswordChange = (value) => {
    setPassword(value);
    if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // valida antes de chamar a API (mensagens nossas, não as do navegador)
    const nextErrors = {
      email: validateEmail(email),
      password: password ? "" : PASSWORD_REQUIRED_MESSAGE,
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setLoading(true);

    try {
      // Cliente e colaborador usam rotas diferentes no backend
      const endpoint = accountType === "colaborador" ? "/auth/staff/login" : "/auth/user/login";

      const response = await api.post(endpoint, {
        email: email.trim(),
        password,
        rememberUser,
      });

      // /auth/staff/login devolve { token, staff }; /auth/user/login devolve { token, user }
      login(response.token, response.staff ?? response.user);

      toast.success("Login realizado", {
        description: "Bem-vindo de volta!",
      });

      // decide o destino pelo "type" que veio DE VERDADE no token, não
      // pela aba que estava selecionada (evita mandar alguém pra área
      // errada se o backend responder algo diferente do esperado)
      const decoded = decodeToken(response.token);
      navigate(decoded?.type === "staff" ? '/staff/dashboard' : '/user');
    } catch (error) {
      toast.danger("Erro ao entrar", {
        description: error.message || "E-mail ou senha inválidos.",
      });
      console.error({ error });
    } finally {
      setLoading(false);
    }
  };

  // Campos compartilhados pelas duas abas (cliente e colaborador). O estado é controlado,
  // então o que foi digitado continua ali ao trocar de aba.
  const formFields = (
    <div className="w-full max-w-sm space-y-6">
      {/* Email */}
      <TextField
        name="email"
        type="email"
        value={email}
        onChange={handleEmailChange}
        isInvalid={!!errors.email}
        validationBehavior="aria"
      >
        <Label>Email</Label>
        <Input
          autoComplete="email"
          className="w-full text-base md:text-sm font-medium bg-surface-secondary hover:bg-surface-tertiary p-4"
          placeholder="nome@email.com"
        />
        <FieldError>{errors.email}</FieldError>
      </TextField>

      {/* Password */}
      <TextField
        name="password"
        type="password"
        className="md:font-medium"
        value={password}
        onChange={handlePasswordChange}
        isInvalid={!!errors.password}
        validationBehavior="aria"
      >
        <Label>Senha</Label>
        <InputGroup className="bg-surface-secondary hover:bg-surface-tertiary p-2">
          <InputGroup.Input
            type={isVisible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="text-base md:text-sm font-medium"
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
        <FieldError>{errors.password}</FieldError>
      </TextField>

      {/* Actions */}
      <div className="flex gap-3 items-center justify-between">
        <Checkbox name="remember-user" isSelected={rememberUser} onChange={setRememberUser}>
          <Checkbox.Content className="text-muted">
            <Checkbox.Control className="size-5 bg-surface-secondary border">
              <Checkbox.Indicator />
            </Checkbox.Control>
            Lembre-se de mim
          </Checkbox.Content>
        </Checkbox>

        {/* o e-mail já digitado (e o tipo de conta) vão junto, sem aparecer na URL */}
        <Link
          to="/recovery"
          state={{ email: email.trim(), accountType }}
          className="group flex items-center gap-1 text-sm font-semibold text-field-placeholder hover:underline"
        >
          Esqueceu a senha?
          <ArrowRight className="size-4 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
        </Link>
      </div>

      {/* Submit */}
      <Button type="submit" color="primary" className="w-full p-6" size="lg" isDisabled={isLoading}>
        {isLoading ? <Spinner className="size-6 text-white" /> : "Entrar"}
      </Button>
    </div>
  );

  return (
    <Form onSubmit={handleSubmit} validationBehavior="aria" noValidate>
      <div className="h-dvh bg-overlay overflow-hidden justify-center gap-2 p-4 md:grid md:grid-cols-4">

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

          <div className="w-full max-w-sm space-y-6 mt-20">
            {/* Header */}
            <div className="space-y-2 text-center mb-10 md:mb-18">
              <h1 className="text-2xl font-bold sm:text-3xl">Entre no SPA</h1>

              {/* Register link */}
              <span
              className="flex justify-center font-semibold text-sm lg:text-base text-field-placeholder gap-2"
              > Não tem uma conta?
                <Link
                  to="/register"
                  className="text-brand hover:underline"
                >
                  Criar agora
                </Link>
              </span>
            </div>

            <Tabs className="w-full max-w-md p-2" selectedKey={accountType} onSelectionChange={setAccountType}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="Options">
                  <Tabs.Tab id="cliente">
                    Sou cliente
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="colaborador">
                    Sou colaborador
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel className="pt-4" id="cliente">{formFields}</Tabs.Panel>
              <Tabs.Panel className="pt-4" id="colaborador">{formFields}</Tabs.Panel>
            </Tabs>
          </div>
        </div>
      </div>
    </Form>
  )
}
