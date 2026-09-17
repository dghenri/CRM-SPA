import React, { useEffect, useState, useRef } from 'react'
import Carousel from "../../components/Carousel";
import { Link, useNavigate } from "react-router-dom";
import api from '../../api/api';
import { useAuth } from "../../context/AuthContext";
import { decodeToken } from "../../utils/jwt";
import formatPhone from "../../utils/formatPhone"

import {
  Card,
  Button,
  InputGroup,
  Label,
  TextField,
  FieldError,
  Spinner,
  Input,
  ListBox,
  DateField,
  Description,
  Select,
  Form,
  toast,
} from "@heroui/react"

import {
  Eye,
  EyeOff,
  Mail,
} from 'lucide-react';

export default function Register() {
  const [isVisible, setIsVisible] = useState(false);
  const inputName     = useRef();
  const inputEmail    = useRef();
  const inputPassword = useRef();
  const inputPhone    = useRef();
  const [gender, setGender] = useState("");
  const [inputBirthdate, setBirthdate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { token, loading } = useAuth();

  useEffect(() => {
    document.title = "Register | Viva Bem SPA";
  }, []);

  // Se já existir uma sessão válida, não faz sentido mostrar o cadastro -
  // manda direto pra área certa (staff ou cliente)
  useEffect(() => {
    if (loading || !token) return;

    const decoded = decodeToken(token);
    navigate(decoded?.type === "staff" ? '/staff/dashboard' : '/user', { replace: true });
  }, [loading, token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const name = inputName.current.value.trim();
    const email = inputEmail.current.value.trim();
    const password = inputPassword.current.value;
    const phone = inputPhone.current.value.trim();

    if (!name || !email || !password) {
      toast.danger("Dados incompletos", {
        description: "Preencha nome, email e senha.",
      });
      return;
    }

    if (!inputBirthdate) {
      toast.danger("Dados incompletos", {
        description: "Selecione a data de nascimento.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const data = {
        name,
        email,
        password,
        phone,
        gender: gender || undefined,
        // CalendarDate -> "YYYY-MM-DD", formato que o backend converte com new Date()
        birthdate: inputBirthdate.toString(),
      };

      await api.post('/auth/user/register', data);

      toast.success("Conta criada", {
        description: "Agora é só entrar com seu email e senha.",
      });

      navigate("/auth/login");
    } catch (error) {
      toast.danger("Erro ao criar conta", {
        description: error.response?.data?.error || "Não foi possível criar a conta. Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <div className="h-dvh justify-center bg-overlay gap-2 p-4 md:grid md:grid-cols-4">

        {/* Mobile header */}
        <div className="flex justify-center items-center gap-2 md:hidden">
          <img className="size-25" src="/LotusIcon.svg" alt="" />
          <h1 className="text-2xl font-bold text-brand">Viva Bem SPA</h1>
        </div>

        {/* Left column - formulário */}
        <div className="col-span-2 md:col-span-2 flex items-[safe_center] lg:items-center justify-center overflow-y-auto rounded-3xl mt-10 md:mt-0">
          <div className="w-full max-w-xl space-y-6 p-6">
            {/* Header */}
            <div className="space-y-2 text-center mb-10 md:mb-18">
              <h1 className="text-2xl font-bold sm:text-3xl">Criar nova conta</h1>

              <span
                className="flex gap-2 justify-center font-semibold text-field-placeholder"
              > Already have account?
                <Link
                  to="/auth/login"
                  className="text-orange-500 hover:underline"
                >
                  Sign In now
                </Link>
              </span>
            </div>

            {/*-------------------------------------------------------------- INPUT GROUP */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="input-type-name">Nome e sobrenome</Label>
                  <Input
                    id="input-type-name"
                    aria-label="Name"
                    placeholder="Ex: Anakin Skywalker"
                    className="bg-surface-secondary hover:bg-surface-tertiary font-medium text-base md:text-sm p-4"
                    ref={inputName}
                  />
                </div>

                {/* Email */}
                <TextField className="w-full" name="email" type="email">
                  <Label>Email</Label>

                  <InputGroup className="justify-between bg-surface-secondary hover:bg-surface-tertiary p-2">
                    <InputGroup.Input
                      className="w-full font-medium text-base md:text-sm"
                      placeholder="nome@email.com"
                      ref={inputEmail}
                    />

                    <InputGroup.Suffix>
                      <Mail className="size-6 text-muted" />
                    </InputGroup.Suffix>
                  </InputGroup>

                  <FieldError>Please enter a valid email address</FieldError>
                </TextField>

                {/* Password */}
                <TextField className="w-full" name="password" type="password">
                  <Label>Senha</Label>

                  <InputGroup className="justify-between bg-surface-secondary hover:bg-surface-tertiary p-2">
                    <InputGroup.Input
                      className="w-full font-medium text-base md:text-sm"
                      placeholder="Enter password"
                      type={isVisible ? "text" : "password"}
                      ref={inputPassword}
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
                </TextField>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="input-type-phone">Telefone (apenas números)</Label>
                  <Input
                    id="input-type-phone"
                    aria-label="Phone"
                    placeholder="(00) 0 0000-0000"
                    className="bg-surface-secondary hover:bg-surface-tertiary font-medium text-base md:text-sm p-4"
                    ref={inputPhone}
                    onChange={(e) => {e.target.value = formatPhone(e.target.value)}}
                  />
                </div>

                <Select
                  placeholder="Clique para selecionar"
                  selectedKey={gender}
                  onSelectionChange={setGender}
                >
                  <Label>Gênero</Label>
                  <Select.Trigger className="bg-surface-secondary hover:bg-surface-tertiary p-4">
                    <Select.Value className="font-medium text-sm" />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Description />
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="Male" textValue="Masculino">
                        <Label htmlFor="Male">Masculino</Label>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="Female" textValue="Feminino">
                        <Label htmlFor="Female">Feminino</Label>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="Other" textValue="Other">
                        <Label htmlFor="Other">Outro</Label>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="PreferNotToSay" textValue="PreferNotToSay">
                        <Label htmlFor="PreferNotToSay">Prefiro não informar</Label>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>

                <DateField
                  value={inputBirthdate}
                  onChange={setBirthdate}
                >
                  <Label htmlFor="input-type-number">Data de nascimento</Label>
                  <DateField.Group className="bg-surface-secondary hover:bg-surface-tertiary py-7">
                    <DateField.Input className="font-medium text-sm">
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                  </DateField.Group>
                  <Description></Description>
                  <FieldError />
                </DateField>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              color="primary"
              className="w-full col-span-2 p-6"
              size="lg"
              isDisabled={isLoading}
            >
              {isLoading ? (
                <Spinner className="size-6 text-white" />
              ) : (
                "Criar conta"
              )}
            </Button>
          </div>
        </div>

        {/* Right column - carousel */}
        <div className="hidden md:col-span-2 md:block md:h-full">
          <Card className="relative h-full overflow-hidden rounded-3xl p-0">
            <Carousel />
          </Card>
        </div>
      </div>
    </Form>
  )
}
