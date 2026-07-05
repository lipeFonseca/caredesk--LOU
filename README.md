# CareDesk 🏥

Sistema de acompanhamento de pacientes para clínicas cirúrgicas.

---

## Stack

| Camada     | Tecnologia                        |
|------------|-----------------------------------|
| Frontend   | React 18 + Vite + Tailwind + Framer Motion |
| Backend    | Cloudflare Workers + Hono.js      |
| Banco      | Cloudflare D1 (SQLite)            |
| Auth       | JWT (jose) + PBKDF2               |
| Notif.     | Telegram Bot API                  |
| Email      | Resend (free tier)                |

---

## Setup — Passo a Passo

### 1. Pré-requisitos

```bash
node -v   # >= 18
npm -v    # >= 9
```

### 2. Criar conta Cloudflare (gratuito)

Acesse https://dash.cloudflare.com e crie uma conta gratuita.

### 3. Instalar Wrangler globalmente

```bash
npm install -g wrangler
wrangler login
```

### 4. Criar banco D1

```bash
cd worker
wrangler d1 create caredesk
```

Copie o `database_id` gerado e cole em `wrangler.toml`:
```toml
database_id = "SEU_ID_AQUI"
```

### 5. Inicializar schema

```bash
# Local (desenvolvimento)
npm run db:init

# Produção (remoto)
npm run db:init:remote
```

### 6. Configurar secrets

```bash
wrangler secret put JWT_SECRET
# Digite uma string aleatória longa (ex: use: openssl rand -hex 32)

wrangler secret put RESEND_API_KEY
# Cole sua chave do Resend (https://resend.com — free tier: 3000 emails/mês)
```

### 7. Instalar dependências e rodar

```bash
# Worker
cd worker && npm install && npm run dev

# Frontend (outro terminal)
cd frontend && npm install && npm run dev
```

### 8. Criar usuário admin inicial

Com o worker rodando localmente, execute:

```bash
node scripts/create-admin.js
```

Ou acesse diretamente: `POST http://localhost:8787/api/setup/admin`
(disponível apenas em development, removido em produção)

### 9. Configurar Telegram Bot

1. Abra o Telegram e fale com @BotFather
2. `/newbot` → escolha nome → copie o token
3. Envie uma mensagem para o bot
4. Acesse: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Copie seu `chat_id`
6. No sistema: Admin → Integrações → preencha bot token e chat ID

---

## Estrutura do Projeto

```
caredesk/
├── frontend/   # React + Vite
└── worker/     # Cloudflare Workers + Hono
```

---

## Protocolo de Follow-up

Ao cadastrar um paciente, define-se um protocolo de dias (ex: `7,15,30,60,90`).

O sistema calcula:
- Dia 0: data da cirurgia
- A cada contato registrado, o próximo protocolo é ativado
- O cron job roda todo dia às 8h (Fortaleza) e envia alertas

### Urgências visuais

| Cor    | Status                |
|--------|-----------------------|
| 🟢 Verde  | Dentro do prazo     |
| 🟡 Âmbar  | Vence em 1-2 dias   |
| 🟠 Laranja | Vence hoje         |
| 🔴 Vermelho | Atrasado          |

---

## Deploy em Produção

```bash
# Worker
cd worker && wrangler deploy

# Frontend (Cloudflare Pages)
cd frontend && npm run build
wrangler pages deploy dist --project-name caredesk
```

Ou, no terminal do VS Code na raiz do projeto:

```powershell
npm run deploy:worker
npm run deploy:frontend
npm run deploy
```

---

## Variáveis de Ambiente

| Secret          | Onde usar              | Como obter          |
|-----------------|------------------------|---------------------|
| `JWT_SECRET`    | Worker (wrangler secret) | `openssl rand -hex 32` |
| `RESEND_API_KEY`| Worker (wrangler secret) | https://resend.com  |
| `FRONTEND_URL`  | `wrangler.toml [vars]`  | URL do seu deploy   |

---

## Acesso Cloudflare Local

Para trabalhar com deploys e D1 remoto sem versionar credenciais:

1. Copie `worker/.dev.vars.example` para `worker/.dev.vars`
2. Preencha `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`
3. Carregue as variáveis antes de comandos remotos do Wrangler:

```powershell
cd worker
. .\scripts\load-cloudflare-env.ps1
npx wrangler whoami
npx wrangler d1 execute caredesk-sprint --remote --command "SELECT COUNT(*) FROM patients"
```

O arquivo `worker/.dev.vars` já é ignorado pelo Git.

---

## GitHub Actions

O repositório inclui um workflow em `.github/workflows/deploy.yml` que faz deploy automatico no `push` para `main` e tambem pode ser disparado manualmente.

Antes de funcionar no GitHub, cadastre estes secrets no repositorio:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Variavel opcional recomendada no GitHub:

- `VITE_API_BASE_PRODUCTION`

Fluxo atual do workflow:

1. faz deploy do Worker com `npx wrangler deploy`
2. faz build do frontend com `VITE_API_BASE` vindo da variavel `VITE_API_BASE_PRODUCTION`
3. publica o frontend no projeto Pages `caredesk-lou`

---

## API no Frontend

O frontend resolve a API assim:

1. se `VITE_API_BASE` estiver definido, usa esse valor
2. em desenvolvimento local, sem `VITE_API_BASE`, usa `/api` e o proxy do Vite para `http://localhost:8787`
3. em producao, sem `VITE_API_BASE`, cai no Worker publico `https://caredesk-worker.faugusto-thecoral.workers.dev`

Para configurar localmente, copie `frontend/.env.example` para `frontend/.env.local` e ajuste somente se quiser apontar para outra API.
