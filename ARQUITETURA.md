# Mapa de Arquitetura — CareDesk

> Documento gerado em 2026-07-12 por leitura completa do código (backend + frontend), sem nenhuma alteração de linha de código. Objetivo: servir de mapa de referência por área/arquivo para facilitar manutenção futura. Este documento é uma **fotografia do estado do código nesta data** — `README.md` e `Status.md` continuam sendo a memória viva de decisões de produto; este arquivo é o mapa técnico de "o que cada parte faz e por quê".
>
> **Nota de atualização (2026-07-20):** varredura de consistência encontrou varios trechos desatualizados abaixo (a maioria dos achados da secao 5 ja foi corrigida). Trechos afetados foram ajustados inline; ver `Status.md` (secoes `11.36`, `11.37`, `11.42`, `11.44`-`11.48`) para o historico completo de quando/por que cada correcao aconteceu.

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
| `patients.js` | CRUD de pacientes — entidade central do domínio. Enriquece cada paciente com protocolo resolvido e urgência calculada. Tambem expõe as sub-rotas de checklist de documentos (`/:id/documents[/:templateId]`). | autenticado; DELETE = admin |
| `followups.js` | Registro de contatos (ligação/email/presencial). Ao criar um follow-up, **marca como lidas** as notificações não lidas do paciente (efeito colateral implícito). | autenticado (qualquer agente) |
| `agents.js` | CRUD de agentes/equipe + upload/remoção de avatar (R2). Rota de leitura de avatar é pública. | autenticado; escrita = admin |
| `protocols.js` | CRUD de templates de protocolo de contato (conjunto de "dias" pós-cirurgia). Garante um único `is_default=1` via UPDATE em massa antes de gravar. `is_default` hoje so serve pra pre-selecionar protocolo no cadastro (ver `2.3`) — nao e mais lido como fallback em `resolvePatientProtocol`. | autenticado; escrita = admin |
| `document-templates.js` | CRUD do catálogo de "Protocolo de Documentos" (`send`/`request`), mesmo padrão de `protocols.js` incluindo bloqueio `409` de exclusão em uso. | autenticado; escrita = admin |
| `message-protocols.js` | CRUD de templates de mensagem ligados a `protocol_id + day_offset`. | autenticado; escrita = admin |
| `notifications.js` | **Duas sub-apps num só arquivo**: notificações internas do agente + rotas de settings/branding (incluindo endpoints públicos usados pela tela de login). | mistura de público/autenticado/admin |
| `settings.js` | Arquivo fachada de uma linha: reexporta `settingsRoutes` de `notifications.js`. A lógica real de settings **não está aqui**. | — |
| `setup.js` | Cria/sobrescreve o admin padrão (`POST /api/setup/admin`). Bloqueado se `APP_ENV === 'production'` **e** exige header `X-Setup-Token` quando a secret `SETUP_TOKEN` estiver configurada (camada extra adicionada em `2026-07-13`). | bloqueado em produção |

Detalhes de negócio relevantes:
- `resolveWritableProtocolId` (em `patients.js`) resolve o protocolo no **create**: usa o `protocol_id` enviado se válido, senão grava o `id` do protocolo `is_default` diretamente no paciente (atribuição única no momento do cadastro, não um fallback de leitura recorrente).
- Exclusão de paciente com protocolo `is_custom=1` (one-off) também remove o protocolo órfão.
- `PATCH /notifications/:id/read` **valida ownership** desde `2026-07-13` (`WHERE id = ? AND agent_id = ?`, retorna `404` se nenhuma linha do próprio agente for afetada) — corrigido o IDOR mencionado antes nesta seção.
- Rotas públicas de asset (`GET /agents/avatar/:key`, `GET /settings/logo/:key`) precisam estar declaradas **antes** do `.use('*', authMiddleware)` na respectiva sub-app — ordem de declaração é uma dependência crítica no Hono.

### 2.3 Services e utils

**`worker/src/services/scheduler.js`** — lógica do cron diário (`0 11 * * *` = 8h em America/Fortaleza). Para cada paciente `active`, resolve o protocolo, calcula o próximo marco pendente via `getNextPendingMilestone`, e cria notificação (`followup_due` ou `followup_overdue`) se ainda não existir uma **não lida** para o mesmo dia. Pacientes sem `assigned_agent_id` geram notificações "órfãs" (nunca aparecem em `GET /notifications` de ninguém).

**`worker/src/utils/protocols.js`** — regra de negócio mais crítica do sistema. Desde `2026-07-20` (`Status.md` `11.48`), resolve protocolo do paciente em só duas origens possíveis: `LINKED` (paciente tem `protocol_id` válido, apontando pra um `contact_protocols` existente) → `EMPTY` (sem protocolo vinculado, nenhum marco/urgência calculado). Os níveis antigos `DEFAULT`/`GLOBAL`/`LEGACY` foram removidos — não existe mais nenhum fallback automático de leitura. Também calcula marcos (`buildProtocolMilestones`), próximo marco pendente (`getNextPendingMilestone` — assume follow-ups registrados em ordem sequencial estrita, por contagem, não por correlação real com o marco) e urgência (`calcProtocolUrgency`: `overdue`/`due`/`soon`/`ok`/`none`).

**`worker/src/utils/documentTemplates.js`** — helper puro de validação do catálogo de "Protocolo de Documentos" (`isValidDocumentCategory`, `isValidDocumentStatus`, `validateDocumentTemplatePayload`), espelha o padrão de `messageTemplates.js`.

**`worker/src/utils/storage.js`** — núcleo compartilhado de upload/leitura/remoção de imagens no bucket R2 único (`LOGO_BUCKET`), reusado por avatares de agente e branding. `sanitizeScopedAssetKey` é a camada de segurança contra path traversal (exige prefixo de pasta permitido + extensão válida). `buildAssetResponse` serve os assets com CORS aberto (`*`), intencionalmente mais permissivo que o CORS global — necessário para `<img src>`.

### 2.4 Banco de dados

**`worker/src/db/schema.sql`** — schema canônico (usado via `npm run db:init` para banco novo). `10` tabelas: `agents` (com `avatar_url`/`avatar_storage_key`), `patients` (coluna legada `protocol_days` **removida** na `0009`), `followup_logs` (FK cascade em `patients`), `notifications` (FK cascade em `patients`), `contact_protocols`, `protocol_message_templates`, `document_templates`, `patient_documents`, `app_settings` (chave-valor), `login_rate_limit`. `password_reset_tokens` foi **removida** na `0007` (nunca teve rota funcional; `RESEND_API_KEY` removido junto de `.dev.vars.example`).

**Migrations (`worker/migrations/`)** — `13` arquivos (`0000` a `0012`), rastreadas numa tabela `_migrations` no próprio D1 via `worker/scripts/run-migrations.js` (`npm run db:migrate[:remote]`), que aplica só o que ainda não foi marcado como aplicado:
| Arquivo | O que faz |
|---|---|
| `0000_protocol-backfill.sql` | Atribui protocolo default a pacientes sem `protocol_id` |
| `0001_contact-cleanup.sql` | Recria `patients`/`notifications` (padrão SQLite de recriar tabela para mudanças estruturais) |
| `0002_agent-avatars.sql` | `ALTER TABLE agents ADD COLUMN avatar_url, avatar_storage_key` |
| `0003_login-branding.sql` | Seed de `background_image_url`, `login_image_url`, `favicon_url` em `app_settings` |
| `0004_login-border-settings.sql` | Seed de todo o bloco `login_border_*` em `app_settings` |
| `0005_login-background.sql` | Chave `login_background_image_url` para o fundo da tela de login |
| `0006_contact-type-whatsapp.sql` | Adiciona `whatsapp` ao CHECK de `contact_type` |
| `0007_remove-password-reset-tokens.sql` | `DROP TABLE` da feature órfã |
| `0008_protocol-message-templates.sql` | Tabela `protocol_message_templates` |
| `0009_drop-legacy-patient-protocol-days.sql` | Remove a coluna legada `patients.protocol_days` |
| `0010_patient_query_indexes.sql` | 3 índices de performance na listagem de pacientes |
| `0011_document-protocol.sql` | Tabelas `document_templates` + `patient_documents` |
| `0012_remove-global-protocol-fallback.sql` | Remove a chave residual `app_settings.contact_protocol_days` |

**Cuidado operacional conhecido:** migrations multi-instrução aplicadas via `--remote --file` já aplicaram só a primeira instrução do arquivo silenciosamente, sem erro (aconteceu com a `0010`) — sempre verificar via `sqlite_master` direto após aplicar remoto, não confiar só no `_migrations`/exit code.

### 2.5 Scripts, testes e config

- `worker/scripts/create-admin.js` — CLI que chama `POST /api/setup/admin` contra o worker local.
- `worker/scripts/load-cloudflare-env.ps1` — carrega `.dev.vars` como env vars do processo (para `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`).
- `worker/test/*.test.js` (Node test runner nativo) — cobre `utils/protocols.js`, `utils/storage.js` (`sanitizeScopedAssetKey` e afins), `utils/documentTemplates.js`, `middleware/auth.js` (`signToken`/`authMiddleware`/`adminOnly` via contexto Hono fake). Rotas continuam sem teste automatizado dedicado, validadas manualmente via curl.
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
- `useSettingsStore` (não persistido, recarregado a cada boot) — branding completo. `getProtocolDays()` foi **removido** junto com o fallback `GLOBAL` (`2026-07-20`) — dias de protocolo hoje só vêm do próprio paciente (`protocol_days_parsed`), nunca da store de settings.

### 3.3 Camada de API (`services/api.js`)

Client HTTP único (`request()`), resolve base URL por prioridade `VITE_API_BASE` → proxy do Vite em dev → URL de produção hardcoded como fallback. Injeta `Authorization: Bearer` automaticamente. **Qualquer 401 dispara logout automático**, mesmo em chamadas que não esperam isso. Namespaces expostos: `auth`, `patients` (incluindo `listDocuments`/`assignDocument`/`updateDocumentStatus`/`unassignDocument`), `documentTemplates`, `followups`, `agents`, `notifications`, `protocols`, `messageProtocols`, `settings`.

### 3.4 Páginas (`pages/`)

| Página | Responsabilidade | Observação |
|---|---|---|
| `Login.jsx` | Tela pública, layout dividido (institucional + formulário), borda animada configurável | Branding vem de `useSettingsStore` populado por `App.jsx` antes do login |
| `Dashboard.jsx` | KPIs, contatos do dia, ligação em massa (`tel:` sequencial), feed de atividade | "Ligação em massa" é só abrir o discador do SO várias vezes — sem integração real de telefonia |
| `Patients.jsx` | Lista/tabela com filtros e paginação | Paginação é **server-side** desde `2026-07-14` — `GET /patients?page&limit` retorna `{ patients, total }`; `Dashboard.jsx` continua pedindo sem `page` pra obter a base ativa inteira (KPIs) |
| `NewPatient.jsx` | Formulário de cadastro com seleção de protocolo e de documentos | Pré-seleciona o protocolo `is_default`; desde `2026-07-20` também lista o catálogo de "Protocolo de Documentos" por checkbox (Enviar/Solicitar), atribuídos via `PUT /patients/:id/documents/:templateId` logo após o cadastro |
| `PatientDetail.jsx` | Hub central: dados clínicos, checklist de documentos, timeline, histórico, 3 modais (contato/edição/exclusão) | `1036` linhas — ainda não quebrado em componentes menores (`Status.md` `12.4.2`); tem builder de protocolo customizado inline dentro do modal de registro de contato |
| `Admin.jsx` | 5 abas: Protocolos de Contato, Protocolo de Mensagens, Protocolo de Documentos, Equipe, Identidade Visual | `762` linhas; `SettingsTab()` morto já foi **removido** (`2026-07-14`) |

### 3.5 Componentes

- `components/PatientPanel.jsx` — drawer lateral com resumo do paciente; ícone/label de tipo de contato, urgência e status hoje vêm de `utils/contactDisplay.js` compartilhado com `PatientDetail.jsx` (duplicação resolvida em `2026-07-14`, ver secao 5).
- `components/admin/BrandingSettingsTab.jsx` — formulário completo de branding + upload de 4 assets (logo/background/login/favicon) + preview ao vivo do login. Após qualquer mutação, rebusca `GET /settings` inteiro por segurança.
- `components/admin/DocumentProtocolTab.jsx` — aba "Protocolo de Documentos": subabas locais Enviar/Solicitar, CRUD do catálogo, badge de quantos pacientes usam cada item.
- `components/patient/PatientDocumentsSection.jsx` — card de checklist de documentos na página do paciente; carrega/recarrega sozinho a partir de `patientId`, toggle de atribuição e de status (`pending`/`done`).
- `components/common/Avatar.jsx` — avatar com fallback de iniciais, componente puro sem estado.
- `components/layout/AppLayout.jsx` — shell autenticado (sidebar + header); faz polling de notificações a cada 60s enquanto montado, sem pausa quando a aba perde foco.
- `components/ui/LoginPulsingBorder.jsx` — wrapper lazy-loaded (`React.lazy`/`Suspense`, desde `2026-07-14`) do shader `@paper-design/shaders-react`; desabilita automaticamente se `prefers-reduced-motion`.

### 3.6 Theme/branding

- `theme/branding.js` — normalização/sanitização de todo o branding vindo da API (`sanitizeBrandUrl` rejeita esquemas perigosos tipo `javascript:` — proteção XSS relevante), fallbacks de exibição, geração de logo/favicon SVG default a partir das iniciais da clínica. Exporta `DEFAULT_BRANDING_SETTINGS`, usado tanto por `useSettingsStore` quanto por `BrandingSettingsTab.getDefaultFormState()` (fonte única desde `2026-07-14`).
- `theme/visualThemes.js` — 5 temas de cor predefinidos + derivação de paleta MD3 completa (modo claro) via mistura de cores.
- `theme/colorUtils.js` — `mix`/`normalizeHex`/`hexToRgb`/`rgbToHex`/`hexToRgbTriplet`, extraídos em `2026-07-14` pra sair da duplicação entre `visualThemes.js` e `darkPalette.js` (ambos importam daqui agora).
- `darkPalette.js` — equivalente a `visualThemes.js` para modo escuro.

### 3.7 Utils e estilos

- `utils/protocols.js` — espelho client-side da lógica de protocolo do backend (marcos, próximo contato, timeline, `countdownProgress` relativo à janela entre marcos). Mesma premissa do backend: follow-ups são contados sequencialmente, sem correlação real com o marco esperado.
- `assets/globals.css` — fontes (Cormorant Garamond + Manrope via `@import`), classes utilitárias (`.card`, `.btn*`, `.input`, `.badge*`), variáveis `:root` como fallback estático (sobrescritas em runtime pelo JS de tema).

### 3.8 Config de build

- `vite.config.js` — alias `@` → `src`, proxy `/api` → `localhost:8787` em dev.
- `tailwind.config.js` — cores MD3 como referências a CSS custom properties (permite troca de tema em runtime); **exceção**: cores de erro e grupo `urgency.*` são hex hardcoded — `urgency.*` está definido mas não é usado nas páginas (que reimplementam cores inline).

---

## 4. Fluxos-chave transversais

**Autenticação:** `POST /auth/login` → PBKDF2 verify → JWT HS256 8h (assinatura manual via Web Crypto) → `Authorization: Bearer` em todo request → `authMiddleware` injeta `agent` no contexto → `adminOnly` quando necessário. Um 401 em qualquer chamada do frontend dispara logout automático.

**Resolução de protocolo:** mesma regra `LINKED → EMPTY` (sem fallback automático, desde `2026-07-20`) implementada de forma independente no backend (`worker/src/utils/protocols.js`, com testes) e no frontend (`frontend/src/utils/protocols.js`, com testes desde `2026-07-14`) — cálculos de urgência/timeline são replicados nos dois lados para evitar round-trip, mas isso significa que uma mudança de regra precisa ser feita em dois lugares.

**Storage de imagens:** um único bucket R2 compartilhado entre avatares de agente e branding, isolado por prefixo de pasta + `sanitizeScopedAssetKey`; leitura sempre pública (sem auth) para suportar `<img src>` direto.

**Branding/login:** `app_settings` guarda todo o branding (cores, logos, efeito de borda) → rota pública sanitizada (`GET /settings/public`) alimenta a tela de login sem sessão → `App.jsx` bloqueia o primeiro paint até esse fetch resolver, evitando flash de branding antigo.

---

## 5. Pontos de atenção para manutenção futura

Achados originais da leitura de `2026-07-12`, com o que já foi corrigido marcado explicitamente (ver `Status.md` pra data/commit de cada correção):

**Código morto / dependências não usadas — tudo corrigido**
- ~~`jose` no `package.json` do worker sem uso~~ — removida em `2026-07-13`.
- ~~`Admin.jsx` contém `SettingsTab()` não referenciado~~ — removida em `2026-07-14`.
- ~~Tokens `colors.urgency.*` não usados~~ — removidos de `tailwind.config.js` em `2026-07-14`.

**Funcionalidades incompletas/órfãs**
- ~~Tabela `password_reset_tokens`/`RESEND_API_KEY` órfãs~~ — removidas em `2026-07-13` (migration `0007`); reset de senha continua só via admin (`POST /agents/:id/reset-password`), por decisão deliberada.
- `PatientPanel.jsx` navega para `/patients/:id` com `state={{ openEdit: true }}`, mas `PatientDetail.jsx` nunca lê esse state — **ainda não verificado se segue valendo**, não fez parte de nenhuma rodada de correção até `2026-07-20`.

**Duplicações que exigem sincronização manual**
- Regra de resolução de protocolo continua replicada em backend e frontend (arquitetura inalterada, so a regra em si ficou mais simples — `LINKED`/`EMPTY`).
- ~~Helpers de cor duplicados entre `visualThemes.js` e `darkPalette.js`~~ — extraídos para `theme/colorUtils.js` em `2026-07-14`.
- ~~Defaults de branding duplicados~~ — unificados em `theme/branding.js` (`DEFAULT_BRANDING_SETTINGS`) em `2026-07-14`.
- ~~Lógica/markup de `PatientDetail.jsx` duplicada em `PatientPanel.jsx`~~ — extraída para `utils/contactDisplay.js` em `2026-07-14`.

**Riscos/particularidades de segurança — todos corrigidos em `2026-07-13` (`Status.md` `11.36`)**
- ~~`PATCH /notifications/:id/read` sem ownership~~ — agora filtra por `agent_id`, retorna `404` sem match.
- ~~Rate limit só por IP~~ — agora também por email normalizado, bloqueia se qualquer uma das duas chaves estourar.
- ~~`verifyPassword` não timing-safe~~ — comparação byte a byte em tempo constante.
- ~~`POST /api/setup/admin` só depende de `APP_ENV`~~ — camada extra opcional via `SETUP_TOKEN`/`X-Setup-Token`.
- Adicionalmente: `secureHeaders` (Hono) + CSP/`_headers` no Pages, `npm audit --audit-level=high` no CI.

**Lacunas de automação — parcialmente fechadas**
- ~~Sem testes de frontend~~ — Vitest configurado em `2026-07-14`, cobre `utils/protocols.js` e `theme/branding.js`.
- Backend expandiu além de `utils/protocols.js`: `utils/storage.js`, `utils/documentTemplates.js`, `middleware/auth.js` também têm teste. Rotas continuam sem teste automatizado dedicado (validação manual via curl).
- ~~Scripts npm cobrem só 0000/0001~~ — `worker/scripts/run-migrations.js` (`npm run db:migrate[:remote]`) cobre as `13` migrations com tracking em `_migrations`.

**Arquivos grandes** — ainda pendente, nenhuma quebra feita até `2026-07-20` (`Status.md` `12.4.2`)
- `frontend/src/pages/PatientDetail.jsx` — `1036` linhas, hub de múltiplas responsabilidades (dados, checklist de documentos, timeline, 3 modais, builder de protocolo inline).
- `frontend/src/pages/Admin.jsx` — `762` linhas, 5 abas no mesmo arquivo.
