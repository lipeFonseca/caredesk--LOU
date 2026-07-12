# Mapa de Arquitetura — CareDesk

> Documento gerado em 2026-07-12 por leitura completa do código (backend + frontend), sem nenhuma alteração de linha de código. Objetivo: servir de mapa de referência por área/arquivo para facilitar manutenção futura. Este documento é uma **fotografia do estado do código nesta data** — `README.md` e `Status.md` continuam sendo a memória viva de decisões de produto; este arquivo é o mapa técnico de "o que cada parte faz e por quê".

## Como usar este documento

Cada área do sistema está mapeada com: responsabilidade, principais funções/rotas/componentes, dependências (quem usa / quem é usado) e detalhes não óbvios (regras de negócio, efeitos colaterais, particularidades). No final há uma seção consolidada de **pontos de atenção para manutenção** — código morto, duplicações, funcionalidades incompletas e riscos identificados durante a leitura.

---

## 1. Visão geral

- **Backend:** Cloudflare Workers + Hono.js, banco Cloudflare D1 (SQLite), storage Cloudflare R2, autenticação JWT (HS256, implementado manualmente via Web Crypto) + PBKDF2 para senha.
- **Frontend:** React 18 + Vite + Tailwind (tokens Material Design 3, cores dinâmicas via CSS custom properties) + Framer Motion + Zustand + date-fns (locale pt-BR) + Material Symbols Outlined.
- **Domínio:** acompanhamento pós-operatório de pacientes de clínica — protocolos de contato, follow-ups manuais (ligação/email/presencial), notificações internas via cron diário. Módulo de mensagens (Telegram/WhatsApp) foi removido do produto.
- **Deploy:** Cloudflare Pages (frontend) + Workers (API), oficializado via GitHub Actions (`.github/workflows/deploy.yml`); scripts locais em `scripts/*.ps1` para deploy manual/emergencial.

---

## 2. Backend (`worker/`)

### 2.1 Entrypoint e middleware

**`worker/src/index.js`** — monta a instância Hono raiz, aplica CORS (whitelist de origem: `FRONTEND_URL` + `localhost:5173`/`4173`, com `credentials: true`), registra todas as sub-rotas sob `/api/*`, define `GET /health`, handlers de 404/erro genéricos, e exporta `{ fetch, scheduled }` — o `scheduled` é o gancho do cron trigger que chama `runScheduler(env)`.

**`worker/src/middleware/auth.js`** — JWT HS256 implementado à mão via `crypto.subtle` (a lib `jose`, listada no `package.json`, **não é usada** — dependência morta). Exporta:
- `signToken(payload, secret)` — expiração fixa de 8h, sem refresh token.
- `authMiddleware` — valida `Authorization: Bearer`, injeta `c.set('agent', payload)`.
- `adminOnly` — exige `role === 'admin'`; deve sempre vir depois de `authMiddleware`.
- Comparação de assinatura via `timingSafeEqual` (mitiga timing attack na verificação do token).
- Não há blacklist/revogação — logout é 100% client-side.

### 2.2 Rotas (`worker/src/routes/`)

| Arquivo | Responsabilidade | Auth |
|---|---|---|
| `auth.js` | Login (com rate limit por IP), `GET /me`, troca de senha. Exporta `hashPassword`/`verifyPassword` (PBKDF2, 100k iterações) reusados por `agents.js` e `setup.js`. | login público; resto autenticado |
| `patients.js` | CRUD de pacientes — entidade central do domínio. Enriquece cada paciente com protocolo resolvido e urgência calculada. | autenticado; DELETE = admin |
| `followups.js` | Registro de contatos (ligação/email/presencial). Ao criar um follow-up, **marca como lidas** as notificações não lidas do paciente (efeito colateral implícito). | autenticado (qualquer agente) |
| `agents.js` | CRUD de agentes/equipe + upload/remoção de avatar (R2). Rota de leitura de avatar é pública. | autenticado; escrita = admin |
| `protocols.js` | CRUD de templates de protocolo de contato (conjunto de "dias" pós-cirurgia). Garante um único `is_default=1` via UPDATE em massa antes de gravar. | autenticado; escrita = admin |
| `notifications.js` | **Duas sub-apps num só arquivo**: notificações internas do agente + rotas de settings/branding (incluindo endpoints públicos usados pela tela de login). | mistura de público/autenticado/admin |
| `settings.js` | Arquivo fachada de uma linha: reexporta `settingsRoutes` de `notifications.js`. A lógica real de settings **não está aqui**. | — |
| `setup.js` | Cria/sobrescreve o admin padrão (`POST /api/setup/admin`). Bloqueado inteiramente se `APP_ENV === 'production'`. | bloqueado em produção |

Detalhes de negócio relevantes:
- `resolveWritableProtocolId` (em `patients.js`) resolve o protocolo no create/update: usa o `protocol_id` enviado se válido, senão cai no protocolo default.
- Exclusão de paciente com protocolo `is_custom=1` (one-off) também remove o protocolo órfão.
- `PATCH /notifications/:id/read` não verifica ownership — qualquer agente autenticado pode marcar como lida a notificação de outro agente.
- Rotas públicas de asset (`GET /agents/avatar/:key`, `GET /settings/logo/:key`) precisam estar declaradas **antes** do `.use('*', authMiddleware)` na respectiva sub-app — ordem de declaração é uma dependência crítica no Hono.

### 2.3 Services e utils

**`worker/src/services/scheduler.js`** — lógica do cron diário (`0 11 * * *` = 8h em America/Fortaleza). Para cada paciente `active`, resolve o protocolo, calcula o próximo marco pendente via `getNextPendingMilestone`, e cria notificação (`followup_due` ou `followup_overdue`) se ainda não existir uma **não lida** para o mesmo dia. Pacientes sem `assigned_agent_id` geram notificações "órfãs" (nunca aparecem em `GET /notifications` de ninguém).

**`worker/src/utils/protocols.js`** — **regra de negócio mais crítica do sistema**, único módulo com testes automatizados. Resolve protocolo do paciente numa cadeia de prioridade: `LINKED` (vinculado ao paciente) → `DEFAULT` (protocolo padrão global) → `GLOBAL` (`app_settings.contact_protocol_days`) → `LEGACY` (coluna antiga `patients.protocol_days`, CSV) → `EMPTY`. Também calcula marcos (`buildProtocolMilestones`), próximo marco pendente (`getNextPendingMilestone` — assume follow-ups registrados em ordem sequencial estrita, por contagem, não por correlação real com o marco) e urgência (`calcProtocolUrgency`: `overdue`/`due`/`soon`/`ok`/`none`).

**`worker/src/utils/storage.js`** — núcleo compartilhado de upload/leitura/remoção de imagens no bucket R2 único (`LOGO_BUCKET`), reusado por avatares de agente e branding. `sanitizeScopedAssetKey` é a camada de segurança contra path traversal (exige prefixo de pasta permitido + extensão válida). `buildAssetResponse` serve os assets com CORS aberto (`*`), intencionalmente mais permissivo que o CORS global — necessário para `<img src>`.

### 2.4 Banco de dados

**`worker/src/db/schema.sql`** — schema canônico (usado via `npm run db:init` para banco novo). Tabelas: `agents` (com `avatar_url`/`avatar_storage_key`), `patients` (com coluna legada `protocol_days` CSV), `followup_logs` (FK cascade em `patients`), `notifications` (FK cascade em `patients`), `contact_protocols`, `app_settings` (chave-valor), `login_rate_limit`, `password_reset_tokens` (**presente no schema mas sem nenhuma rota que a use** — funcionalidade de "esqueci senha" planejada e não implementada; consistente com `RESEND_API_KEY` não referenciado em nenhum código).

**Migrations (`worker/migrations/`):**
| Arquivo | O que faz |
|---|---|
| `0000_protocol-backfill.sql` | Atribui protocolo default a pacientes sem `protocol_id` |
| `0001_contact-cleanup.sql` | Recria `patients`/`notifications` (padrão SQLite de recriar tabela para mudanças estruturais) |
| `0002_agent-avatars.sql` | `ALTER TABLE agents ADD COLUMN avatar_url, avatar_storage_key` |
| `0003_login-branding.sql` | Seed de `background_image_url`, `login_image_url`, `favicon_url` em `app_settings` |
| `0004_login-border-settings.sql` | Seed de todo o bloco `login_border_*` em `app_settings` |

Não há tabela de controle de versão de migrations — execução é manual via scripts npm (que cobrem só 0000/0001) ou `wrangler d1 execute` direto (0002-0004).

### 2.5 Scripts, testes e config

- `worker/scripts/create-admin.js` — CLI que chama `POST /api/setup/admin` contra o worker local.
- `worker/scripts/load-cloudflare-env.ps1` — carrega `.dev.vars` como env vars do processo (para `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`).
- `worker/test/protocols.test.js` — único arquivo de teste do backend (Node test runner nativo), cobre exclusivamente `utils/protocols.js`. Nenhuma rota, middleware ou service tem teste automatizado.
- `worker/wrangler.toml` — bindings `DB` (D1) e `LOGO_BUCKET` (R2), vars `FRONTEND_URL`/`APP_ENV`, cron `0 11 * * *`; `account_id` não versionado (lido de env var).

---

## 3. Frontend (`frontend/`)

### 3.1 Bootstrap

**`main.jsx`** → monta `<App />`, importa `globals.css`.

**`App.jsx`** — componente raiz: bloqueia o primeiro paint até `useSettingsStore` carregar (via `api.settings.get()` autenticado ou `api.settings.getPublic()` público, dependendo de `isAuthenticated`), aplica paleta de tema (claro/escuro) via `applyThemePaletteWithMode`, sincroniza favicon/title do documento. Sem retry em caso de erro — apenas cai nos defaults do store.

**`router/index.jsx`** — rotas via `react-router-dom`: `/login` pública; `/`, `/patients`, `/patients/new`, `/patients/:id` privadas dentro de `AppLayout`; `/admin` privada + admin-only (dupla checagem: `PrivateRoute` no router + a própria página assume admin).

### 3.2 Estado global (`store/index.js`)

- `useAuthStore` (persistido) — `token`+`agent`; `logout()` faz hard-redirect (`window.location.href`), não usa o router.
- `useNotifStore` (não persistido) — notificações + contador não lido.
- `useThemeStore` (persistido) — dark mode.
- `useSettingsStore` (não persistido, recarregado a cada boot) — branding completo; `getProtocolDays()` faz parse do fallback global com valor hardcoded duplicado em relação a `theme/branding.js`.

### 3.3 Camada de API (`services/api.js`)

Client HTTP único (`request()`), resolve base URL por prioridade `VITE_API_BASE` → proxy do Vite em dev → URL de produção hardcoded como fallback. Injeta `Authorization: Bearer` automaticamente. **Qualquer 401 dispara logout automático**, mesmo em chamadas que não esperam isso. Namespaces expostos: `auth`, `patients`, `followups`, `agents`, `notifications`, `protocols`, `settings`.

### 3.4 Páginas (`pages/`)

| Página | Responsabilidade | Observação |
|---|---|---|
| `Login.jsx` | Tela pública, layout dividido (institucional + formulário), borda animada configurável | Branding vem de `useSettingsStore` populado por `App.jsx` antes do login |
| `Dashboard.jsx` | KPIs, contatos do dia, ligação em massa (`tel:` sequencial), feed de atividade | "Ligação em massa" é só abrir o discador do SO várias vezes — sem integração real de telefonia |
| `Patients.jsx` | Lista/tabela com filtros e paginação | Paginação é **client-side** — backend sempre retorna a lista completa filtrada |
| `NewPatient.jsx` | Formulário de cadastro com seleção de protocolo | Pré-seleciona o protocolo `is_default` |
| `PatientDetail.jsx` | Hub central: dados clínicos, timeline, histórico, 3 modais (contato/edição/exclusão) | Arquivo grande (sinalizado no `Status.md`); tem builder de protocolo customizado inline dentro do modal de registro de contato |
| `Admin.jsx` | 3 abas: Protocolos, Equipe, Identidade Visual | Contém `SettingsTab()` **morto** (não referenciado, substituído por `BrandingSettingsTab`) |

### 3.5 Componentes

- `components/PatientPanel.jsx` — drawer lateral com resumo do paciente; **duplica significativamente** lógica/markup de `PatientDetail.jsx` (mesmos cálculos de urgência/timeline reimplementados, sem componente compartilhado).
- `components/admin/BrandingSettingsTab.jsx` — formulário completo de branding + upload de 4 assets (logo/background/login/favicon) + preview ao vivo do login. Após qualquer mutação, rebusca `GET /settings` inteiro por segurança.
- `components/common/Avatar.jsx` — avatar com fallback de iniciais, componente puro sem estado.
- `components/layout/AppLayout.jsx` — shell autenticado (sidebar + header); faz polling de notificações a cada 60s enquanto montado, sem pausa quando a aba perde foco.
- `components/ui/LoginPulsingBorder.jsx` — wrapper do shader `@paper-design/shaders-react`; desabilita automaticamente se `prefers-reduced-motion`.

### 3.6 Theme/branding

- `theme/branding.js` — normalização/sanitização de todo o branding vindo da API (`sanitizeBrandUrl` rejeita esquemas perigosos tipo `javascript:` — proteção XSS relevante), fallbacks de exibição, geração de logo/favicon SVG default a partir das iniciais da clínica.
- `theme/visualThemes.js` — 5 temas de cor predefinidos + derivação de paleta MD3 completa (modo claro) via mistura de cores.
- `darkPalette.js` — equivalente para modo escuro; **duplica** helpers de manipulação de cor (`mix`, `hexToRgb` etc.) em vez de compartilhar com `visualThemes.js`.

### 3.7 Utils e estilos

- `utils/protocols.js` — espelho client-side da lógica de protocolo do backend (marcos, próximo contato, timeline, `countdownProgress` relativo à janela entre marcos). Mesma premissa do backend: follow-ups são contados sequencialmente, sem correlação real com o marco esperado.
- `assets/globals.css` — fontes (Cormorant Garamond + Manrope via `@import`), classes utilitárias (`.card`, `.btn*`, `.input`, `.badge*`), variáveis `:root` como fallback estático (sobrescritas em runtime pelo JS de tema).

### 3.8 Config de build

- `vite.config.js` — alias `@` → `src`, proxy `/api` → `localhost:8787` em dev.
- `tailwind.config.js` — cores MD3 como referências a CSS custom properties (permite troca de tema em runtime); **exceção**: cores de erro e grupo `urgency.*` são hex hardcoded — `urgency.*` está definido mas não é usado nas páginas (que reimplementam cores inline).

---

## 4. Fluxos-chave transversais

**Autenticação:** `POST /auth/login` → PBKDF2 verify → JWT HS256 8h (assinatura manual via Web Crypto) → `Authorization: Bearer` em todo request → `authMiddleware` injeta `agent` no contexto → `adminOnly` quando necessário. Um 401 em qualquer chamada do frontend dispara logout automático.

**Resolução de protocolo:** mesma cadeia de prioridade (`LINKED → DEFAULT → GLOBAL → LEGACY`) implementada de forma independente no backend (`worker/src/utils/protocols.js`, com testes) e no frontend (`frontend/src/utils/protocols.js`, sem testes) — cálculos de urgência/timeline são replicados nos dois lados para evitar round-trip, mas isso significa que uma mudança de regra precisa ser feita em dois lugares.

**Storage de imagens:** um único bucket R2 compartilhado entre avatares de agente e branding, isolado por prefixo de pasta + `sanitizeScopedAssetKey`; leitura sempre pública (sem auth) para suportar `<img src>` direto.

**Branding/login:** `app_settings` guarda todo o branding (cores, logos, efeito de borda) → rota pública sanitizada (`GET /settings/public`) alimenta a tela de login sem sessão → `App.jsx` bloqueia o primeiro paint até esse fetch resolver, evitando flash de branding antigo.

---

## 5. Pontos de atenção para manutenção futura

Achados relevantes durante a leitura completa (nenhum foi alterado — apenas registrado):

**Código morto / dependências não usadas**
- `jose` (JWT lib) está no `package.json` do worker mas não é usada — a implementação é manual em `middleware/auth.js`.
- `Admin.jsx` contém `SettingsTab()` inteiro, não referenciado (substituído por `BrandingSettingsTab`).
- Tokens `colors.urgency.*` definidos em `tailwind.config.js` mas não usados — páginas reimplementam as mesmas cores inline.

**Funcionalidades incompletas/órfãs**
- Tabela `password_reset_tokens` e `RESEND_API_KEY` sugerem fluxo de "esqueci minha senha" planejado, nunca implementado — reset de senha hoje só existe via admin (`POST /agents/:id/reset-password`).
- `PatientPanel.jsx` navega para `/patients/:id` com `state={{ openEdit: true }}`, mas `PatientDetail.jsx` nunca lê esse state.

**Duplicações que exigem sincronização manual**
- Regra de resolução de protocolo replicada em backend e frontend.
- Helpers de manipulação de cor (`mix`, `hexToRgb` etc.) duplicados entre `visualThemes.js` e `darkPalette.js`.
- Defaults de branding duplicados entre `useSettingsStore` e `getDefaultFormState()` em `BrandingSettingsTab.jsx`.
- Lógica/markup de `PatientDetail.jsx` significativamente duplicada em `PatientPanel.jsx`.

**Riscos/particularidades de segurança a ter em mente**
- `PATCH /notifications/:id/read` não valida ownership (qualquer agente pode marcar notificação de outro como lida).
- Rate limit de login é por IP, não por email — fácil de contornar; IPs compartilhados podem bloquear usuários legítimos.
- `verifyPassword` (backend) não é timing-safe (usa `.every()` com early-exit).
- `POST /api/setup/admin` permite recriar o admin sem autenticação — depende inteiramente de `APP_ENV=production` estar corretamente setado para ficar bloqueado.

**Lacunas de automação**
- Sem testes de frontend (nenhum framework configurado).
- Backend só testa `utils/protocols.js` — rotas, middleware, scheduler e storage não têm cobertura automatizada.
- Scripts npm cobrem só as migrations 0000/0001; 0002-0004 exigem `wrangler d1 execute` manual.

**Arquivos grandes sinalizados** (já registrados em `Status.md`, confirmados nesta leitura)
- `frontend/src/pages/PatientDetail.jsx` — hub de múltiplas responsabilidades (dados, timeline, 3 modais, builder de protocolo inline).
- `frontend/src/pages/Admin.jsx` — 3 abas + componente morto no mesmo arquivo.
