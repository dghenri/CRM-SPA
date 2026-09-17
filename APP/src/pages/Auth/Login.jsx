import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/api"
import { useAuth } from "../../context/AuthContext";
import { decodeToken } from "../../utils/jwt";

import Carousel from "../../components/Carousel";

import {
  Avatar,
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
  SquareArrowOutUpRight as BlankIcon,
} from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberUser, setRememberUser] = useState(false)
  const [isLoading, setLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false);
  // Controla qual aba está ativa, pra sabermos qual rota de login chamar
  const [accountType, setAccountType] = useState("cliente");
  const navigate = useNavigate();
  const { login, user, token, loading } = useAuth();

  useEffect(() => {
    document.title = "Login | Viva Bem SPA";
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Cliente e colaborador usam rotas diferentes no backend
      const endpoint = accountType === "colaborador" ? "/auth/staff/login" : "/auth/user/login";

      const response = await api.post(endpoint, {
        email,
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

  return (
    <Form onSubmit={handleSubmit}>
      <div className="h-dvh bg-overlay overflow-hidden justify-center gap-2 p-4 md:grid md:grid-cols-4">

        {/* Left column */}
        <div className="flex justify-center items-center gap-2 md:hidden">
          <img className="size-25" src="/LotusIcon.svg" alt="" />
          <h1 className="text-2xl font-bold text-brand">Viva Bem SPA</h1>
        </div>
        <div className="hidden md:col-span-2 md:block md:h-full">
          
          <Card className="relative h-full overflow-hidden rounded-3xl p-0">
            <Carousel />
          </Card>
        </div>

        {/* Right column */}
        <div className="col-span-2 flex items-center justify-center overflow-y-auto rounded-3xl mt-10">
          <div className="w-full max-w-sm space-y-6">

            {/* Header */}
            <div className="space-y-2 text-center mb-10 md:mb-18">
              <h1 className="text-2xl font-bold sm:text-3xl">Sign in to Spa</h1>

              <p className="text-xs md:text-sm font-semibold text-field-placeholder">
                Enter your credentials to access your account
              </p>
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
              <Tabs.Panel className="pt-4" id="cliente">
                <div className="w-full max-w-sm space-y-6">
                  {/* Email */}
                  <TextField
                    name="email"
                    type="email"
                  >
                    <Label>Email</Label>
                    <Input
                      className="w-full text-base md:text-sm font-medium bg-surface-secondary hover:bg-surface-tertiary p-4" 
                      placeholder="name@email.com" 
                      onChange={(e) => setEmail(e.target.value)} />
                    <FieldError />
                  </TextField>

                  {/* Password */}
                  <TextField
                    name="password"
                    type="password"
                    className="md:font-medium"
                  >
                    <Label>Password</Label>
                    <InputGroup className="bg-surface-secondary hover:bg-surface-tertiary p-2">
                      <InputGroup.Input 
                        type={isVisible ? "text" : "password"}
                        placeholder="Enter your password"
                        onChange={(e) => setPassword(e.target.value)}
                        className="text-base md:text-sm font-medium"
                      />
                      <InputGroup.Suffix className="pr-0">
                        <Button
                          isIconOnly
                          aria-label={isVisible ? "Hide password" : "Show password"}
                          size="lg"
                          variant="ghost"
                          onPress={() => setIsVisible(!isVisible)}
                          className="hover:bg-surface"
                        >
                          {isVisible ? <Eye className="size-6 text-muted" /> : <EyeOff className="size-6 text-muted" />}
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                    <FieldError />
                  </TextField>

                  {/* Actions */}
                  <div className="flex gap-3 items-center justify-between">
                    <Checkbox name="remember-user" onChange={setRememberUser}>
                      <Checkbox.Content className="text-muted">
                        <Checkbox.Control className="size-5 bg-surface-secondary border">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        Remember me
                      </Checkbox.Content>
                    </Checkbox>

                    <Link 
                      target="_blank"
                      to="/recovery"
                      className="group flex items-center gap-1 text-sm font-semibold text-field-placeholder hover:underline"
                    >
                      Forgot password?
                      <BlankIcon className="size-4
                        opacity-0
                        -translate-x-1
                        transition-all
                        duration-200
                        group-hover:opacity-100
                        group-hover:translate-x-0" 
                      />
                    </Link>
                  </div>

                  {/* Submit */}       
                  <Button
                    type="submit"
                    color="primary"
                    className="w-full p-6"
                    size="lg"
                    isDisabled={isLoading}
                  >
                    {isLoading ? (
                      <Spinner className="size-6 text-white" />
                    ) : (
                      "Sign In"
                    )}
                  </Button>

                  {/* Register link */}
                  <span
                  className="flex justify-center font-semibold text-sm lg:text-base text-field-placeholder gap-2"
                  > Don't have an account?
                    <Link
                      to="/register"
                      className="text-orange-500 hover:underline"
                    >
                      Sign Up now
                    </Link>
                  </span>
                </div>
              </Tabs.Panel>
              <Tabs.Panel className="pt-4" id="colaborador">
                <div className="w-full max-w-sm space-y-6">
                  {/* Email */}
                  <TextField
                    name="email"
                    type="email"
                  >
                    <Label>Email</Label>
                    <Input
                      className="w-full text-base md:text-sm font-medium bg-surface-secondary hover:bg-surface-tertiary p-4" 
                      placeholder="name@email.com" 
                      onChange={(e) => setEmail(e.target.value)} />
                    <FieldError />
                  </TextField>

                  {/* Password */}
                  <TextField
                    name="password"
                    type="password"
                    className="font-medium"
                  >
                    <Label>Password</Label>
                    <InputGroup className="bg-surface-secondary hover:bg-surface-tertiary p-2">
                      <InputGroup.Input 
                        type={isVisible ? "text" : "password"}
                        placeholder="Enter your password"
                        onChange={(e) => setPassword(e.target.value)}
                        className="text-base md:text-sm font-medium"
                      />
                      <InputGroup.Suffix className="pr-0">
                        <Button
                          isIconOnly
                          aria-label={isVisible ? "Hide password" : "Show password"}
                          size="lg"
                          variant="ghost"
                          onPress={() => setIsVisible(!isVisible)}
                          className="hover:bg-surface"
                        >
                          {isVisible ? <Eye className="size-6 text-muted" /> : <EyeOff className="size-6 text-muted" />}
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                    <FieldError />
                  </TextField>

                  {/* Actions */}
                  <div className="flex gap-3 items-center justify-between">
                    <Checkbox name="remember-user" onChange={setRememberUser}>
                      <Checkbox.Content className="text-muted">
                        <Checkbox.Control className="size-5 bg-surface-secondary border">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        Remember me
                      </Checkbox.Content>
                    </Checkbox>

                  </div>

                  {/* Submit */}       
                  <Button
                    type="submit"
                    color="primary"
                    className="w-full p-6"
                    size="lg"
                    isDisabled={isLoading}
                  >
                    {isLoading ? (
                      <Spinner className="size-6 text-white" />
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                  <div className="flex justify-center font-semibold text-sm lg:text-base">
                    <Link 
                      target="_blank"
                      to="/recovery"
                      className="group flex items-center gap-1 text-sm font-semibold text-field-placeholder hover:underline mb-1.5"
                    >
                      Forgot password?
                      <BlankIcon className="size-4
                        opacity-0
                        -translate-x-1
                        transition-all
                        duration-200
                        group-hover:opacity-100
                        group-hover:translate-x-0" 
                      />
                    </Link>
                  </div>
                </div>
              </Tabs.Panel>
            </Tabs>
          </div>
        </div>
      </div>
    </Form>
  )
}
