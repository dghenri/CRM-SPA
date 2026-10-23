<div align="center">

<img src="FRONTEND/public/LotusIcon.svg" alt="Viva Bem SPA" width="96" />

# Viva Bem SPA

**Sistema completo de agendamentos e gestão para clínicas de estética e bem-estar.**
Do site de apresentação ao painel da equipe, tudo em um só lugar.

<br />

![Versão](https://img.shields.io/badge/vers%C3%A3o-1.0.0-4881fe?style=for-the-badge)
![Status](https://img.shields.io/badge/status-em%20produ%C3%A7%C3%A3o-22c55e?style=for-the-badge)

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)

[Funcionalidades](#-funcionalidades) · [Tecnologias](#-tecnologias) · [Como rodar](#-como-rodar-localmente) · [Estrutura](#-estrutura-do-projeto) · [Deploy](#-deploy) · [Roadmap](#-roadmap)

</div>

---

## Sobre o projeto

O **Viva Bem SPA** é uma plataforma web para clínicas de cuidados pessoais. Os clientes descobrem os procedimentos, agendam o horário, pagam com cupom de desconto e acompanham o histórico. A equipe cuida da agenda, do estoque, do faturamento e da comunicação com os clientes em um painel próprio.

O sistema tem **três áreas** que compartilham a mesma API:

| Área | Para quem | O que faz |
| --- | --- | --- |
| **Site público** | Visitantes | Landing page com procedimentos, apresentação da plataforma e localização |
| **Área do cliente** | Clientes | Agendar, ver histórico, usar cupons, gerenciar perfil e endereços |
| **Painel da equipe** | Equipe e administração | Agenda, serviços, estoque, cupons, receita, comunicação e visão geral |

---

## Funcionalidades

### Área do cliente
- **Fluxo de agendamento em 4 passos:** procedimento, data e horário, pagamento e confirmação.
- **Horários reais:** os horários vêm do expediente da profissional responsável e já descontam o que está ocupado.
- **Cupons da carteira:** o cliente vê os cupons que tem e aplica o que vale para o procedimento. Os indisponíveis aparecem com o motivo.
- **Confirmação por deslize:** um botão deslizante confirma o agendamento, seguido da opção de **confirmar pelo WhatsApp** ou deixar para depois.
- **Idade mínima** por procedimento, validada no front e na API.
- **Perfil e conta:** avatar, endereços, troca de senha, favoritos e notificações.
- **Home** com carrossel de banners, sessão atual e avisos no sino.

### Painel da equipe
- **Agenda** nas visões dia, semana e mês, com arrastar para remarcar e agendamentos coloridos por status.
- **Serviços** com imagem, preço, duração, idade mínima, profissional responsável e receita (insumos).
- **Estoque** de produtos, lotes, movimentações e pedidos de reposição.
- **Cupons** em porcentagem ou valor fixo, com escopo (todos os serviços, específicos, categoria, primeira compra ou cliente específico), validade e limites de uso.
- **Receita** com resumo, gráficos, formas de pagamento, transações e exportação em PDF.
- **Comunicação:** notificações para o sino dos clientes e banners do carrossel, com agendamento de período.
- **Disponibilidade** semanal de cada profissional, com afastamentos.
- **Visão geral** para a administração, com indicadores e principais clientes.

### Segurança e confiabilidade
- Autenticação por **JWT**, com rotas separadas para cliente e equipe.
- Política de senha (tamanho, força e comparação com nome e e-mail) e **revogação das outras sessões**.
- **Recuperação de senha** por e-mail.
- **Rate limit** nas rotas sensíveis.
- Atualizações em **tempo real** por WebSocket (agenda e avisos).
- Interface **responsiva**: o painel funciona no celular, com menu lateral em gaveta e tabelas que viram cartões.

---

## Tecnologias

**Front-end**
- [React 19](https://react.dev) + [Vite 8](https://vitejs.dev)
- [HeroUI v3](https://www.heroui.com) + [Tailwind CSS v4](https://tailwindcss.com)
- [React Router 7](https://reactrouter.com)
- [Lucide](https://lucide.dev) (ícones), [Motion](https://motion.dev) e Framer Motion (animações)
- [dnd-kit](https://dndkit.com) (arrastar na agenda e ordenação), [jsPDF](https://github.com/parallax/jsPDF) (relatórios em PDF)
- [Three.js](https://threejs.org) / OGL (efeitos visuais da landing) e [Swiper](https://swiperjs.com) (carrosséis)
- [Axios](https://axios-http.com)

**Back-end**
- [Node.js](https://nodejs.org) + [Express 5](https://expressjs.com)
- [Prisma 6](https://www.prisma.io) com [MongoDB Atlas](https://www.mongodb.com/atlas)
- [ioredis](https://github.com/redis/ioredis) (Redis) e WebSocket (`ws`) para tempo real
- JWT (`jsonwebtoken`) e `bcryptjs` para autenticação
- `multer` para upload de imagens e `nodemailer` para SMTP em desenvolvimento

**Serviços**
- [Upstash Redis](https://upstash.com): sessões e cache
- [Brevo](https://www.brevo.com) ou [Resend](https://resend.com): e-mails transacionais pela API HTTPS
- [Cloudinary](https://cloudinary.com) (opcional): fotos de perfil em produção; sem ele, as fotos ficam em disco local

**Hospedagem**
- Front-end na [Vercel](https://vercel.com) e API no [Render](https://render.com)

---

## Como rodar localmente

### Pré-requisitos
- Node.js 20 ou superior
- Um cluster no MongoDB Atlas (o Prisma exige replica set, que o Atlas já tem)
- Uma instância Redis (o plano gratuito do Upstash serve)

### 1. Clonar

```bash
git clone https://github.com/SEU-USUARIO/viva-bem-spa.git
cd viva-bem-spa
```

### 2. API

```bash
cd BACKEND
npm install
# crie o arquivo .env com as variáveis da tabela abaixo
npx prisma generate
npx prisma db push
npm run watch
```

Para rodar sem reiniciar automaticamente, use `npm start`. A API sobe em `http://localhost:3000`.

### 3. Front-end

```bash
cd FRONTEND
npm install
# crie o arquivo .env com VITE_API_URL=http://localhost:3000
npm run dev
```

O front-end abre em `http://localhost:5173`.

### Variáveis de ambiente

**API (`BACKEND/.env`)**

| Variável | Obrigatória | Para quê |
| --- | :---: | --- |
| `DATABASE_URL` | sim | Conexão com o MongoDB Atlas |
| `ACCESS_TOKEN_KEY` | sim | Segredo que assina os tokens JWT |
| `REDIS_URL` | sim | Conexão com o Redis |
| `FRONTEND_URL` | sim | Origem permitida no CORS e base dos links dos e-mails |
| `NODE_ENV` | não | `production` em produção |
| `MAIL_FROM` | para e-mails | Remetente (precisa ser verificado no provedor) |
| `BREVO_API_KEY` | para e-mails | Envio pela Brevo (API HTTPS) |
| `RESEND_API_KEY` | alternativa | Envio pelo Resend (tem prioridade sobre a Brevo) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | alternativa | SMTP, indicado só em desenvolvimento |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | opcional | Fotos de perfil no Cloudinary (ou só `CLOUDINARY_URL`) |
| `CLINIC_TIMEZONE` | opcional | Fuso da clínica |
| `UPLOADS_DIR` | opcional | Pasta das fotos quando não há Cloudinary |

Sem nenhum provedor de e-mail configurado, os e-mails são apenas impressos no console da API.

**Front-end (`FRONTEND/.env`)**

| Variável | Para quê |
| --- | --- |
| `VITE_API_URL` | URL da API (padrão: `http://localhost:3000`) |
| `VITE_WHATSAPP_NUMBER` | WhatsApp do studio: DDI + DDD + número, só dígitos |

O Vite só expõe ao navegador as variáveis que começam com `VITE_`. **Nunca** coloque segredos nelas, e **nunca** versione os arquivos `.env`.

---

## Estrutura do projeto

```text
viva-bem-spa/
├── BACKEND/
│   ├── prisma/              # schema.prisma (modelos do banco)
│   ├── scripts/             # utilitários (ex.: grant-welcome-coupon.js)
│   ├── server.js            # entrada: HTTP + WebSocket
│   └── src/
│       ├── app.js           # Express, CORS e registro das rotas
│       ├── routes/          # users, staff, services, appointments, coupons, stock, revenue...
│       ├── services/        # regras de negócio (notificações, estoque, receitas, cupom de boas-vindas)
│       ├── middleware/      # autenticação e permissões
│       └── lib/             # e-mail, rate limit, realtime, uploads, agenda, validações...
└── FRONTEND/
    ├── public/              # ícones e imagens da landing
    └── src/
        ├── api/             # chamadas à API
        ├── components/      # componentes compartilhados (booking flow, KeyHint, SlideButton...)
        ├── context/         # AuthContext
        ├── hooks/           # useBookingFlow, useNotifications, useBanners...
        ├── pages/
        │   ├── Public/      # landing e autenticação (login, cadastro, recuperação de senha)
        │   ├── Client/      # área do cliente
        │   ├── Staff/       # painel da equipe
        │   ├── Admin/       # visão geral, equipe, usuários e logs
        │   └── Error/       # páginas de erro
        ├── router/          # rotas públicas, do cliente e da equipe
        ├── realtime/        # conexão WebSocket
        └── utils/           # CPF, telefone, senha, JWT, validações...
```

---

## Deploy

| Parte | Plataforma | Observações |
| --- | --- | --- |
| Front-end | Vercel | Pasta `FRONTEND`; o `vercel.json` já trata as rotas do React Router |
| API | Render | Pasta `BACKEND`. Build: `npm install && npx prisma generate`. Start: `npm start`. O plano gratuito hiberna após inatividade |
| Banco | MongoDB Atlas | Libere o IP do Render em *Network Access* |
| E-mail | Brevo ou Resend | O Render gratuito bloqueia SMTP, por isso o envio usa a API HTTPS |

---

## Roadmap

- [ ] Confirmação automática pelo WhatsApp (API oficial)
- [ ] Cookie `httpOnly` para o refresh token, após o domínio próprio
- [ ] Migrar o envio de e-mails para o Resend com domínio verificado
- [ ] Lembretes automáticos de sessão
- [ ] Testes automatizados (API e fluxo de agendamento)
- [ ] Modo escuro na área do cliente

---

## Contribuindo

Este é um projeto em desenvolvimento ativo. Sugestões e correções são bem-vindas:

1. Faça um fork do projeto
2. Crie uma branch: `git checkout -b feature/minha-ideia`
3. Faça o commit: `git commit -m "feat: minha ideia"`
4. Envie: `git push origin feature/minha-ideia`
5. Abra um Pull Request

---

## Licença

Distribuído sob a licença descrita no arquivo [LICENSE](LICENSE).

---

<div align="center">

Feito com cuidado para quem cuida das pessoas.

**Viva Bem SPA**

</div>
