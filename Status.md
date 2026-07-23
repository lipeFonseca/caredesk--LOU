# Status do Projeto CareDesk

Atualizado em: 2026-07-23

Este documento tem dois objetivos: (1) descrever como o sistema funciona hoje, pra quem chega no projeto entender rápido sem ler código primeiro; (2) manter um changelog datado de tudo que já foi decidido e por quê, pra não repetir debate nem redescobrir armadilha já mapeada. Seção 1 a 9 descrevem o **estado atual**. Seção 10 é o **changelog** (histórico, ordem cronológica). Seção 11 são **lições operacionais** que valem como runbook.

---

## 1. O que é o CareDesk

Sistema interno de acompanhamento pós-operatório de uma clínica. Um agente (ou o admin) cadastra o paciente, vincula um protocolo de contato, e o sistema calcula os marcos de acompanhamento (ligar em tal dia, checar em tal outro). O scheduler diário gera notificações internas quando um marco vence.

**Escala do produto:** uma clínica, dois papéis fixos — `agent` (opera o dia a dia: cadastro, contato, checklist de documento) e `admin` (tudo que o agente faz + protocolos, equipe, identidade visual). Multi-clínica (multi-tenant) foi avaliado e **descartado por decisão do usuário** (ver `10.1`, item #1) — não vale a complexidade agora.

### 1.1 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + Tailwind + Framer Motion |
| Backend | Cloudflare Workers + Hono |
| Banco | Cloudflare D1 (SQLite) |
| Storage de arquivo | Cloudflare R2 |
| Autenticação | JWT (HMAC, assinado a mão via Web Crypto — sem lib) + cookie `HttpOnly` |
| Deploy | Cloudflare Workers + Cloudflare Pages, via GitHub Actions ou scripts `.ps1` manuais |

### 1.2 Ambientes

- Frontend: `https://caredesk-lou.pages.dev`
- Worker: `https://caredesk-worker.faugusto-thecoral.workers.dev`
- Local: frontend `http://localhost:5173` (proxy `/api` → `http://localhost:8787`), worker `http://localhost:8787`
- **D1 local e D1 remoto são bancos completamente separados** (`.wrangler/state` local vs. o banco de produção) — credencial, dado e migration aplicada num não existem automaticamente no outro. Ver `11.7` pra armadilha real que isso já causou.

---

## 2. Arquitetura Atual

### 2.1 Autenticação e sessão

Estado atual (desde `2026-07-22`, ver `10.13`):

1. usuário envia `email`/`password` pra `POST /api/auth/login`
2. worker busca o agente, valida a senha com PBKDF2 (`worker/src/routes/auth.js`, `verifyPassword`) em tempo constante — roda o PBKDF2 completo mesmo se o e-mail não existir, comparando contra um hash dummy fixo, pra não vazar por timing se a conta existe
3. login certo → worker assina dois JWT (`worker/src/middleware/auth.js`):
   - **access token**, `15 min`, claims `sub`/`email`/`role`/`name`
   - **refresh token**, `7 dias`, claim `type:'refresh'`, só `sub`
4. os dois vão como cookie `HttpOnly; Secure; SameSite=None` (`access_token` com `path=/`, `refresh_token` com `path=/api/auth/refresh` — só é enviado nessa rota)
5. frontend não guarda mais o token em lugar nenhum acessível a JS — `services/api.js` manda `credentials:'include'` em toda chamada; a store (`store/index.js`) só persiste o objeto `agent`
6. em qualquer `401` fora de `/auth/login`/`/auth/refresh`, o frontend tenta renovar a sessão uma vez (`POST /auth/refresh`, que relê o agente no banco antes de emitir novo access token) antes de deslogar de verdade
7. `authMiddleware` lê o cookie primeiro, com fallback pro header `Authorization: Bearer` (mantido só por transição/scripts)
8. `POST /auth/logout` limpa os dois cookies no servidor (idempotente, funciona mesmo sem sessão válida)

**Por que `SameSite=None` e não `Strict`:** front (`pages.dev`) e worker (`workers.dev`) são domínios (sites) diferentes. `Strict`/`Lax` bloqueariam o navegador de mandar o cookie em qualquer request cross-site — quebraria o login inteiro, silenciosamente. `Secure` funciona em `http://localhost` porque Chrome/Firefox tratam `localhost` como origem confiável mesmo sem HTTPS.

**Rate limit de login:** por IP **e** por e-mail normalizado, mesma tabela `login_rate_limit` (chave prefixada `ip:`/`email:`), bloqueia se qualquer uma estourar (5 tentativas / 15 min), com header `Retry-After` calculado a partir do `locked_until` real.

**Perfis:** `admin`, `agent`.

**O que ainda NÃO existe, por decisão explícita do usuário (`2026-07-22`):** 2FA (TOTP) no login, verificação por e-mail. 2FA na conta Cloudflare em si é responsabilidade do usuário, fora do código.

### 2.2 Pacientes

Campos: nome, telefone, procedimento, data da cirurgia, agente responsável, protocolo de contato, status (`active`/`inactive`/`done`), observações, `created_by` (quem cadastrou).

Sanitização server-side no `POST`/`PATCH` (`worker/src/routes/patients.js`, desde `2026-07-22`): `stripHtml` remove tags de `name`/`procedure`/`notes`, limites de tamanho, `surgery_date` validado por regex, `status` validado contra enum, e `assigned_agent_id`/`protocol_id` validados como FK real (rejeitam id inexistente com `400`, não gravam órfão).

Listagem com paginação server-side (`page`/`limit`, resposta `{ patients, total }`) — o Dashboard continua consumindo a base ativa inteira sem paginar (comportamento preservado de propósito).

Páginas: `Dashboard`, `Patients`, `NewPatient`, `PatientDetail`.

### 2.3 Contatos e acompanhamento

Cada paciente tem protocolo + data de cirurgia → sistema calcula marcos previstos. Contato realizado vira linha em `followup_logs` (tipo `call`/`email`/`whatsapp`/`in_person`, com `outcome`). Timeline no detalhe do paciente mostra progresso, próximo marco e histórico. Registro é manual (detalhe do paciente ou Dashboard).

Módulo de mensagens de WhatsApp/Telegram automatizado **não existe** nesta fase — o painel é centrado em ligação, protocolo e notificação interna.

### 2.4 Protocolos de contato

Tabelas `contact_protocols` (dias negativos/zero/positivos, cor, descrição) + `protocol_message_templates` (mensagem sugerida por marco).

**Resolução de protocolo, hoje só duas origens possíveis** (simplificado em `2026-07-20`, ver `10.11`):
- `LINKED` — paciente tem `protocol_id` real, apontando pra um protocolo que existe
- `EMPTY` — sem protocolo vinculado, nenhuma timeline/urgência calculada

Não existe mais nenhum fallback automático invisível (os antigos níveis `DEFAULT`/`GLOBAL`/`LEGACY` foram removidos — ver `10.11`, `10.8`). `is_default` em `contact_protocols` ainda existe, mas só serve pra **pré-selecionar** o protocolo no formulário de cadastro — se o paciente for criado sem escolher protocolo, o backend grava o `id` do protocolo `is_default` direto no cadastro dele, e a partir daí ele resolve por `LINKED` normalmente (não por fallback em tempo de leitura).

Scheduler e rotas de paciente compartilham a mesma função `resolvePatientProtocol(patient)`.

### 2.5 Protocolo de Documentos

Aba administrativa "Protocolo de Documentos" (entregue `2026-07-14` a `2026-07-20`, ver `10.10`): catálogo configurável (`document_templates`, categoria `send`/`request`) + checklist por paciente (`patient_documents`, status `pending`/`done`). Só metadado/checklist — **sem upload de arquivo real**, nenhum uso de R2 aqui. Atribuição acontece no cadastro (`NewPatient.jsx`) ou depois na página do paciente (`PatientDocumentsSection.jsx`). Exclusão de template em uso é bloqueada com `409` (mesmo padrão de `contact_protocols`).

### 2.6 Dashboard

KPIs (ativos, contatos do dia, atrasados, em dia), lista de contatos do dia com seleção individual/massa, atalho de ligação, confirmação de registro de contato, atividade recente via `notifications`.

### 2.7 Histórico (aba própria)

Feed cronológico de pacientes cadastrados + contatos realizados (`GET /api/activity`, paginado). Entregue como Frente A do roadmap de escalabilidade — detalhe completo em `10.16`/`13.3`.

### 2.8 Notificações e scheduler

Cron diário (worker `scheduled`): busca pacientes ativos, calcula próximo marco pendente, evita duplicar notificação do mesmo dia, grava em `notifications`. Não existe canal de mensagem externo ativo — só notificação interna.

### 2.9 Área administrativa

Abas: Protocolos de Contato, Protocolo de Mensagens, Protocolo de Documentos, Equipe (agentes, com avatar), Identidade Visual (branding completo — logo, cores, tema, imagem/borda pulsante do login).

### 2.10 Storage (R2 + D1)

Regra arquitetural: **R2 pra binário grande** (logo, background, imagem de login, favicon, avatar de agente), **D1 pra metadado/relação/permissão**. Nunca usar R2 como fonte de dado cadastral/clínico/operacional. Namespaces em uso: `branding/logos/`, `branding/backgrounds/`, `branding/login-images/`, `branding/login-backgrounds/`, `branding/favicons/`, `avatars/agents/`. `avatars/patients/` e `attachments/patients/` são roadmap, ainda não implementados (ver `8.2`).

---

## 3. Modelo de Dados

`worker/src/db/schema.sql` + `14` migrations aplicadas (`0000` a `0013`, local e remoto).

**Tabelas:** `agents`, `patients`, `followup_logs`, `notifications`, `contact_protocols`, `protocol_message_templates`, `document_templates`, `patient_documents`, `app_settings`, `login_rate_limit`.

**Colunas/tabelas legadas já removidas** (não existem mais, não precisa reavaliar):
- `patients.protocol_days` (coluna `LEGACY`, removida `0009`, ver `10.9`)
- `app_settings.contact_protocol_days` (fallback `GLOBAL`, removido `0012`, ver `10.11`)
- `password_reset_tokens` (tabela órfã sem rota funcional, removida `0007`, ver `10.5`)

**Colunas adicionadas nas últimas rodadas:** `agents.avatar_url`/`avatar_storage_key`; `patients.created_by` (`0013`, quem cadastrou).

**Índices (14, confirmados via `sqlite_master` em produção em `2026-07-22`):** `idx_patients_agent`, `idx_patients_status`, `idx_patients_surgery_date`, `idx_patients_protocol`, `idx_patients_created`, `idx_followups_patient`, `idx_followups_patient_date`, `idx_followups_created`, `idx_notif_agent`, `idx_notif_date`, `idx_message_templates_protocol_day`, `idx_document_templates_category`, `idx_patient_documents_patient`, `idx_patient_documents_template`.

**Saúde do banco de produção, última auditoria em `2026-07-22`:** zero `patients.protocol_id`/`assigned_agent_id` órfão, zero conta com hash placeholder (`$PLACEHOLDER_HASH$`), todos os índices esperados presentes. Contagem de linhas por tabela nessa data: `agents=1`, `patients=3`, `contact_protocols=0`, `followup_logs=0`, `notifications=4`, `app_settings=35`, `document_templates=3`, `patient_documents=6`, `login_rate_limit=17` (a maioria é dado de teste, ainda não há uso real em produção).

**Runbook de migration:** `worker/scripts/run-migrations.js` (`npm run db:migrate` / `db:migrate:remote`) aplica `migrations/*.sql` em ordem, rastreando o que já rodou numa tabela `_migrations` no próprio D1. **Regra dura desde o incidente da `0010`** (ver `11.3`): depois de qualquer migration multi-instrução aplicada com `--remote`, sempre confirmar o resultado real via `sqlite_master` — não confiar só no exit code do `wrangler` nem no que o script marca como aplicado.

---

## 4. Segurança — Estado Atual

Consolidado após três rodadas de hardening (`2026-07-13`, ver `10.4`; e `2026-07-22`, ver `10.13`).

**O que está protegido:**
- IDOR em `PATCH /api/notifications/:id/read` — filtra por `agent_id` do token
- Timing-safe: `verifyPassword` roda PBKDF2 completo mesmo com e-mail inexistente, comparação final byte a byte em tempo constante
- Rate limit de login por IP **e** por e-mail, com `Retry-After`
- `POST /api/setup/admin` bloqueado fora de ambiente de desenvolvimento (`APP_ENV`), com camada opcional de `SETUP_TOKEN`
- Headers de segurança na API (`secureHeaders` do Hono: `X-Frame-Options: DENY`, `nosniff`, HSTS, `Cross-Origin-Opener-Policy`) e no frontend (`frontend/public/_headers`: CSP restritiva, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) — CSP de produção sem resíduo de `localhost` desde `2026-07-22`
- SQL sempre parametrizado (sem SQLi) — testado ativamente contra produção, ver `10.13`
- Mass assignment protegido — o backend monta o objeto campo a campo, nunca faz `INSERT` a partir do spread direto do body
- Sanitização server-side de todo campo de texto de paciente (`stripHtml` + limites de tamanho) desde `2026-07-22`
- Sessão via cookie `HttpOnly`/`Secure`/`SameSite=None`, access token de `15 min` + refresh token de `7 dias` com renovação automática — token de sessão não é mais legível por JavaScript (antes: JWT de `8h` fixo em `localStorage`) desde `2026-07-22`
- CORS não reflete origem arbitrária (whitelist fixa: `FRONTEND_URL` + `localhost:5173`/`4173`), com `credentials: true` só pra essas origens

**Decisões deliberadas de não fazer (por ora):**
- 2FA (TOTP) no login e verificação por e-mail — usuário recusou explicitamente em `2026-07-22`
- CAPTCHA/Turnstile após tentativas repetidas — item `4.3` do guia de segurança, não implementado ainda
- Criptografia em nível de aplicação pra colunas sensíveis (notas/telefone) + base legal/retenção LGPD formal — item `5`, não implementado ainda
- Crack offline do secret HS256 — item `7`, informativo, não executado
- Multi-tenancy — decisão de produto, não de segurança (ver `10.15`, item #1)

**Validação de ataque mais recente (`2026-07-22`, produção, ver `10.13`):** SQLi (clássico/`UNION`/time-based), NoSQL, `alg:none`, cookie/token forjado, CORS com origem maliciosa, path traversal, `TRACE` — nenhum vetor comprometeu o sistema.

---

## 5. Deploy e Operação

**Scripts manuais:** `scripts/deploy-worker.ps1`, `scripts/deploy-frontend.ps1`, `scripts/deploy-all.ps1` (este último pede confirmação interativa — não roda em shell não-interativo, usar os dois primeiros separados nesse caso). `wrangler` pinado em `@4` nos três, mesma major usada no CI.

**CI/CD:** `.github/workflows/deploy.yml` ("Deploy CareDesk") — dispara em `push` pra `main` ou manualmente (`workflow_dispatch`, com `target: all|worker|frontend`). Job `changes` detecta escopo (`git diff` dos arquivos alterados) e decide se publica `worker`, `frontend` ou os dois — mudança só em `frontend/` não redeploya o worker e vice-versa. `npm audit --audit-level=high` roda nos dois jobs (não-bloqueante, só visibilidade).

**Regra de ouro pra mudança visual crítica:** nada pode ficar só no deploy manual — já causou regressão (`10.7`, o deploy automático via Actions republicou um estado do repositório sem o pacote visual que só tinha ido pro Cloudflare manualmente). O GitHub é a fonte de verdade de publicação; deploy manual é só contingência.

**Secrets do Worker** (via `wrangler secret put`, nunca versionados): `JWT_SECRET`, `JWT_REFRESH_SECRET` (novo desde `2026-07-22`), `SETUP_TOKEN` (opcional).

---

## 6. Estado do Repositório

`main` local sincronizada com `origin/main` — sem commits de diferença em nenhuma direção. Working tree limpa depois de cada rodada de trabalho.

Commits mais recentes relevantes: `3f1929d` (migração de sessão pra cookie `HttpOnly`), `feb5970` (sanitização/CSP/hardening de login), `e2b1adc` (doc — versão anterior deste arquivo).

---

## 7. O que Já Está Pronto

- autenticação com sessão via cookie `HttpOnly` (access `15min` + refresh `7d`), rate limit IP+e-mail, headers de segurança, sanitização server-side
- CRUD de pacientes com paginação server-side e índices de performance
- protocolos de contato (`LINKED`/`EMPTY`, sem fallback automático) e de mensagens
- Protocolo de Documentos (catálogo + checklist por paciente)
- aba de Histórico (feed de atividade paginado)
- Dashboard funcional
- área administrativa completa (protocolos, equipe com avatar, identidade visual)
- scheduler diário de notificações internas
- deploy automatizado via GitHub Actions com detecção de escopo, mais deploy manual de contingência
- testes automatizados: worker `31/31` (`node --test`), frontend `32/32` (`vitest`)
- backup inicial: bookmark de Time Travel + export manual em `backups/d1`

---

## 8. Débito Técnico e Pendências Conhecidas

### 8.1 Refatoração de arquivos grandes

`PatientDetail.jsx` (~`1036` linhas) e `Admin.jsx` (~`762` linhas) continuam grandes — quebra em componentes menores planejada, não feita ainda. Ver plano detalhado arquivo por componente na seção `10.6` (histórico, item `12.4.2` do plano original).

### 8.2 Roadmap de produto (evolução planejada, não dívida)

- `avatars/patients` — imagem de perfil do paciente, reusa o núcleo de storage já existente
- `attachments/patients` — anexos clínicos, precisa de tabela nova (N anexos por paciente), só depois de `avatars/patients`

### 8.3 Segurança — itens do guia externo ainda fora de escopo

CAPTCHA/Turnstile após falhas repetidas, criptografia em nível de aplicação + base legal/retenção LGPD, crack offline do secret (ver seção `4`).

### 8.4 Observabilidade e cache (aprovados, ainda não implementados)

Frente B (aba de Logs/monitoramento de erro) e Frente C (cache de catálogos read-heavy) do roadmap de escalabilidade — aprovadas pelo usuário em `2026-07-20`, detalhadas em `13.4`/`13.5`, ainda não implementadas (Frente A já foi).

---

## 9. Pontos de Atenção

**Alta prioridade:** nenhum item aberto no momento.

**Média prioridade:**
- quebrar `PatientDetail.jsx`/`Admin.jsx` em componentes menores (`8.1`)
- avaliar `avatars/patients`/`attachments/patients` se fizer sentido priorizar (`8.2`)
- CAPTCHA/Turnstile, criptografia de coluna sensível + LGPD formal (`8.3`)
- Frente B (Logs) e Frente C (Cache) do roadmap de escalabilidade (`8.4`)

**Baixa prioridade:**
- refinamentos visuais adicionais
- otimizar re-fetches no frontend
- reduzir o tempo de estado "Carregando ambiente..." na rota `/patients`

---

## 10. Changelog

Ordem cronológica. Cada entrada tem data, o que mudou e por quê — sem repetir aqui o "como funciona hoje" (isso já está nas seções `1` a `4`).

### 10.1 Avatares de agente + storage organizado (`2026-07-11`)

Primeira aplicação real da regra "R2 pra binário, D1 pra metadado" (seção `2.10`). Rotas `POST/DELETE /api/agents/:id/avatar`, `GET /api/agents/avatar/:key`. Migration `0002_agent-avatars.sql`. Sidebar e lista de equipe passaram a renderizar avatar real com fallback por iniciais.

### 10.2 Imagem exclusiva de login + imagem de fundo dedicada (`2026-07-11` a `2026-07-12`)

`login_image_url` (coluna institucional esquerda) e depois `login_background_image_url` (fundo da página inteira, atrás do card) — chaves independentes, sem fallback cruzado entre elas. Migrations `0003`/`0005`. Corrigido também: favicon não estava sendo aplicado em todas as variações de `link rel` (`icon`/`shortcut icon`/`apple-touch-icon`) — `frontend/index.html` ganhou favicon base inline.

### 10.3 Borda pulsante no login (`2026-07-11` a `2026-07-13`, iterativo)

Efeito de shader (`@paper-design/shaders-react`, componente `PulsingBorder`) aplicado só no card de login, configurável na aba de Identidade Visual (preset, cores, intensidade, velocidade, espessura, bloom) e persistido em `app_settings` (migration `0004`). Passou por várias rodadas de ajuste fino até chegar no estado atual: glow envolvendo o card principal inteiro, glass suave restrito à coluna direita (credenciais), coluna institucional da esquerda sempre sólida, geometria do shader sincronizada com o `radius` real do card (antes usava valor fixo, gerava "ponta" visual nos cantos), e uma borda CSS duplicada removida (dois elementos desenhando contorno quase no mesmo raio, gerava costura visível). `frontend/src/components/login/LoginCardLayout.jsx` virou a fonte única de layout, compartilhada entre a tela pública e o preview administrativo — antes duas árvores JSX paralelas, causa raiz de regressões visuais recorrentes.

### 10.4 Primeira rodada de hardening de segurança (`2026-07-13`)

A partir de uma auditoria externa (nota "Segurança em apps web locais"), aplicado: IDOR em `PATCH /api/notifications/:id/read`, timing-safe compare no login, rate limit por IP+e-mail, segunda camada opcional (`SETUP_TOKEN`) em `POST /api/setup/admin`, `secureHeaders` no worker, CSP/headers no frontend, `npm audit` não-bloqueante no CI. **Decisão registrada na época:** migração de sessão pra cookie `HttpOnly` foi **deliberadamente adiada** — motivo, front e worker em domínios diferentes exigiriam `SameSite=None`, considerado risco maior que o benefício imediato dado que a CSP já reduzia boa parte do vetor de XSS. Essa pendência só foi fechada em `2026-07-22` (`10.13`).

### 10.5 Limpeza de features órfãs + wrangler v4 + runbook de migration (`2026-07-13`)

`password_reset_tokens`/`RESEND_API_KEY` removidos (nunca tiveram rota funcional — confirmado que produção tinha `0` linhas antes de dropar). `wrangler` `^3.65.0` → `^4.0.0` nos dois pacotes (alinhado ao que o CI já usava), dependência morta `jose` removida (JWT sempre foi hand-rolled). Criado `worker/scripts/run-migrations.js`, runbook único pra aplicar migrations em ordem com rastreio via tabela `_migrations` — motivado por um incidente real de migration parcialmente aplicada no meio do processo (detalhe em `11.4`).

### 10.6 Deduplicação de código + testes automatizados + coluna legada removida (`2026-07-14`)

Lógica de exibição de contato (ícone/cor/label por tipo, badge de urgência) estava copiada entre `PatientDetail.jsx` e `PatientPanel.jsx` — extraída pra `frontend/src/utils/contactDisplay.js`. Helpers de mistura de cor duplicados entre `visualThemes.js`/`darkPalette.js` — extraídos pra `theme/colorUtils.js`. Defaults de branding duplicados entre a store e o formulário admin — unificados numa constante só. Função morta `SettingsTab()` removida de `Admin.jsx`. Testes automatizados criados do zero: `vitest` no frontend (`32/32`), suíte do worker expandida além de protocolos (`25/25`). Coluna legada `patients.protocol_days` removida (migration `0009`) depois de confirmar `0` pacientes dependendo do fallback `LEGACY`. Um incidente de lockfile no meio do caminho (`vitest@4.1.10` puxando um `esbuild` incompatível e quebrando `npm ci` no CI) — resolvido fixando `vitest@^3.2.4`, depois `3.2.7` por uma CVE crítica na 3.2.4/3.2.5.

### 10.7 Correções de fluxo de deploy e CI (`2026-07-12` a `2026-07-14`, várias entradas)

Deploy manual publicando no Cloudflare sem passar pelo GitHub causou uma regressão real (produção "voltou" pra um estado anterior depois de um push menor reativar o workflow com o repositório desatualizado) — regra endurecida: nada crítico só no deploy manual. Workflow ganhou detecção de escopo (`changes` job, decide `worker`/`frontend`/ambos pelo diff), nome mais legível, e correção de um job que dependia de outro job opcional e ficava `skipped` incorretamente. `actions/checkout`/`actions/setup-node` atualizados pra v5 (deprecação de runtime `node20` anunciada pelo GitHub). `fetch-depth: 2` insuficiente quando um push agrupa múltiplos commits — trocado pra `fetch-depth: 0` no job que faz `git diff` contra commit arbitrário. Node do job de deploy do worker subido pra `22` (exigência do `wrangler@4.110`).

### 10.8 Bug de linha do tempo com paciente sem protocolo (`2026-07-20`)

Usuário reportou timeline aparecendo mesmo sem protocolo de contato cadastrado. Causa: resíduo `app_settings.contact_protocol_days` (arquitetura antiga de fallback `GLOBAL`) ainda sendo lido por `resolvePatientProtocol()`, mesmo com `contact_protocols` vazia. Decisão do usuário: não só limpar o valor, remover o mecanismo de fallback inteiro. Ver `10.11`.

### 10.9 Auditoria de escalabilidade + decisão de roadmap (`2026-07-20`)

Seis frentes de escalabilidade avaliadas com o usuário (multi-tenancy, auditoria/LGPD, busca/paginação, observabilidade, backup automatizado, cache). Aprovadas: aba de Histórico + índices/paginação (Frente A), aba de Logs (Frente B), cache de catálogos (Frente C). Fora por ora: multi-tenancy e backup automatizado (só dado de teste hoje, revisitar quando o sistema tiver dado real). Detalhe completo na seção `13`.

### 10.10 Protocolo de Documentos (`2026-07-14` a `2026-07-20`)

Feature nova: catálogo administrável (`document_templates`, categorias Enviar/Solicitar) + checklist por paciente (`patient_documents`, status `pending`/`done`). Migration `0011`. Decisão inicial era atribuir documento só na página do paciente; revertida depois do usuário ver a tela `Novo Paciente` publicada e pedir a seleção também ali.

### 10.11 Remoção total do fallback automático de protocolo (`2026-07-20`)

Resposta direta ao bug de `10.8`. `resolvePatientProtocol()` simplificado de `LINKED → DEFAULT → GLOBAL → LEGACY` pra só `LINKED`/`EMPTY`. Rota `PATCH /api/settings/protocol` removida (não fazia mais sentido sem nível `GLOBAL`). Migration `0012` apaga a chave `contact_protocol_days`. `is_default` continua existindo, mas só pré-seleciona no cadastro — não é mais fallback de leitura.

### 10.12 Frente A do roadmap — aba Histórico (`2026-07-20` a `2026-07-21`)

Implementada, testada e publicada. `GET /api/activity` (paginado, `patient_created` + `contact` via `UNION ALL`), migration `0013` (`patients.created_by` + dois índices novos), página `Historico.jsx` no menu lateral. Decisões confirmadas pelo usuário: página própria (não modal/aba dentro de outra tela) e adicionar `created_by` no paciente. Deploy feito depois de bateria de testes verde (worker `29/29`, frontend `32/32`) e confirmação explícita do usuário.

### 10.13 Segunda rodada de hardening + migração de sessão pra cookie `HttpOnly` (`2026-07-22`)

Disparada por um pentest externo (`SECURITY_IMPROVEMENTS.md`) contra o ambiente publicado. Escopo definido pelo usuário: troca de senha do admin default (P0) já feita por ele antes; 2FA e verificação por e-mail recusados explicitamente; 2FA da conta Cloudflare fica por conta dele.

**Primeira leva (baixo risco):** sanitização server-side de paciente (seção `2.2`), header `Retry-After` no rate limit, remoção do toggle mostrar/ocultar senha do login (pedido literal: não deixar resíduo de senha visível no inspecionar — o campo agora é sempre `type="password"` e limpa o valor após erro de login), limpeza do resíduo `http://localhost:8787` na CSP de produção. Simulação de ataque rodada contra produção antes do deploy (SQLi, `alg:none`, CORS, path traversal, `TRACE`) — nenhum vetor comprometeu nada; o único achado foi que produção ainda rodava o código antigo (confirma que o fix ainda não tinha sido publicado).

**Segunda leva (mudança de arquitetura de sessão):** fecha a pendência deixada deliberadamente em aberto desde `10.4`. Sessão migrada de JWT em `localStorage` (`8h` fixo) pra cookie `HttpOnly`: access token `15min` + refresh token `7 dias` com renovação automática, `SameSite=None`+`Secure` (desvio deliberado da recomendação `Strict` do guia externo — ver seção `2.1` pro motivo). Novos endpoints `POST /auth/refresh` e `POST /auth/logout`. Novo secret `JWT_REFRESH_SECRET`. Detalhe técnico completo na seção `2.1`.

**Armadilha na validação local:** D1 local é banco separado do remoto — a senha de admin trocada em produção não existe localmente, e o admin local seed tem hash `$PLACEHOLDER_HASH$` (proposital, nunca bate). A rota de correção natural (`create-admin.js` → `POST /api/setup/admin`) também falhou, porque `APP_ENV="production"` em `[vars]` do `wrangler.toml` vale também sob `wrangler dev --local` (sem override de ambiente) — `/api/setup` fica bloqueado localmente também, não só em produção. Contornado gravando o hash PBKDF2 direto no D1 local via `wrangler d1 execute --local`. Ver seção `1.2`.

**Deploy e verificação:** `JWT_REFRESH_SECRET` de produção configurado via `wrangler secret put` antes do deploy do worker. Persistência de configuração visual checada explicitamente (`GET /api/settings/public`) — intacta, deploy de worker não roda migration nem toca em dado. Segunda simulação de ataque pós-deploy (SQLi, JWT forjado, CORS, CSRF via `SameSite`) + auditoria de saúde do banco (zero FK órfã, zero hash placeholder, todos os índices presentes) — sem achado. Detalhe completo em `4` e `3`.

### 10.14 Este documento reescrito (`2026-07-23`)

Reestruturado de um formato de diário cronológico (`11.x` crescente, com numeração duplicada em alguns pontos) pra separar claramente "como o sistema funciona hoje" (seções `1` a `9`) de "o que mudou e quando" (esta seção `10`) e "lição operacional reutilizável" (seção `11`). Nenhum fato técnico foi descartado — entradas muito granulares de ajuste visual (várias rodadas de pixel/raio da borda do login, larguras de modal) foram consolidadas em uma entrada por tema.

---

## 11. Lições Operacionais (runbook)

### 11.1 ACL quebrada entre Codex e Claude Code no Windows (`2026-07-12`, recorrente)

Sintoma: uma ferramenta (geralmente Claude Code) recebe `EPERM`/acesso negado num caminho específico, mesmo com o resto do repositório editável. Causa: Codex roda sob uma identidade Windows sandbox própria e às vezes recria um caminho sem herdar a ACL corretamente, perdendo a entrada de escrita do usuário interativo. A permissão compartilhada (grupo `CodexSandboxUsers`, direito `Modify`) é uma entrada **explícita definida na raiz do repositório** — não herdada de pastas acima.

**Correção:** `takeown /F <caminho> /R /D Y` + `icacls <caminho> /reset /T`, **só no caminho específico afetado, nunca na raiz do projeto** (resetar a raiz apagaria a entrada `CodexSandboxUsers` e derrubaria o acesso do Codex ao repositório inteiro).

### 11.2 D1 remoto pode aplicar só parte de uma migration multi-instrução, sem erro (`2026-07-14`)

`run-migrations.js --remote` reportou sucesso e marcou a migration como aplicada, mas só o primeiro `CREATE INDEX` de um arquivo com três realmente rodou no banco — sem nenhum erro reportado pelo `wrangler`. Local (`--local`) o mesmo arquivo aplicou os três sem problema.

**Regra dura:** depois de qualquer migration multi-instrução aplicada via `--remote`, sempre confirmar o resultado real com `SELECT ... FROM sqlite_master`, nunca confiar só no exit code ou na tabela de tracking.

### 11.3 D1 local e D1 remoto são bancos separados — credencial de um não vale no outro (`2026-07-22`)

Já causou confusão real: senha de admin trocada em produção não existe no D1 local (que tem seu próprio seed com hash placeholder). A rota de setup (`/api/setup/admin`) também não serve de atalho local, porque `APP_ENV="production"` do `wrangler.toml` vale igual sob `wrangler dev --local` (não tem override de ambiente hoje). Pra recriar uma senha de teste local sem depender do endpoint: calcular o hash PBKDF2 a mão (mesmo algoritmo de `hashPassword()`, via Web Crypto) e gravar direto com `wrangler d1 execute --local`.

### 11.4 Path com espaço quebra `execFileSync`/`shell:true` no Windows (`2026-07-13`)

`worker/scripts/run-migrations.js` falhava porque o projeto vive num caminho com espaço (`Developer CODEX`). `execFileSync` sem shell não achava `npx`; com `shell:true` e array de args, o Node não escapa argumentos automaticamente, e o path virava dois argumentos separados. Resolvido com `execSync` e uma string de comando montada manualmente, com aspas onde necessário.

### 11.5 Versão de dependência: sempre confirmar GA antes de subir major (regra geral, aplicada em `2026-07-12`/`2026-07-14`)

Ao atualizar `actions/checkout`/`setup-node` (v4→v5) e `wrangler` (`^3`→`^4`), a prática foi: confirmar changelog real da versão, subir só o mínimo necessário pra resolver o problema (não pular pra major mais recente disponível), e travar a mesma versão entre CI e scripts de deploy manual. Evita absorver mudança não relacionada ao problema que motivou o upgrade.

### 11.6 Lockfile de dependência dev pode quebrar `npm ci` no CI mesmo funcionando local (`2026-07-14`)

`npm install -D vitest` puxou a `4.1.10` (major mais nova), que depende de um `vite`/`esbuild` isolado incompatível com o `vite@5` do projeto. Localmente (Windows) parecia consistente; o `npm ci` estrito do CI (Linux) falhava com dependência ausente do lockfile. **Prática:** depois de instalar/atualizar dependência dev, rodar `rm -rf node_modules && npm ci` localmente antes de subir — replica exatamente o passo do CI.

### 11.7 Mensagem de commit multilinha no Bash tool: nunca usar sintaxe de here-string do PowerShell (`2026-07-21`)

`git commit -m @'...'@` dentro do Bash tool trata `@` como literal (interpretado por `sh`, não por `pwsh`), prefixando a mensagem incorretamente. Usar heredoc (`$(cat <<'EOF' ... EOF)`) ou `-F <arquivo>` sempre que a mensagem tiver mais de uma linha.

### 11.8 CORS + cookie cross-site: `SameSite=None` é obrigatório quando front e API são domínios diferentes (`2026-07-22`)

Guias genéricos de segurança costumam recomendar `SameSite=Strict` por padrão — mas isso pressupõe front e backend no mesmo site (mesmo eTLD+1). Com `pages.dev` e `workers.dev` sendo domínios diferentes, `Strict`/`Lax` bloqueiam silenciosamente o cookie em qualquer request cross-site (o navegador nunca envia, sem erro explícito no clique do usuário — só o login parece "não fazer nada"). Antes de aplicar uma recomendação de segurança sobre cookie, checar primeiro se front e API vivem no mesmo site.

### 11.9 Validação e deploy: papel do Claude Code vs. papel do usuário (consolidado `2026-07-20`)

Validação visual/de navegador é sempre feita pelo usuário — o papel do Claude Code fica limitado a configuração, código, schema, testes automatizados (`node:test`/`vitest`) e `curl` quando fizer sentido. Nenhum Playwright/navegador automatizado roda neste projeto por conta própria. Commit/push/deploy só acontecem quando o usuário pede explicitamente — mesmo com testes 100% verdes.

---

## 12. Roadmap de Escalabilidade

Definido com o usuário em `2026-07-20`. Prioridade oficial do projeto, guia de toda decisão: **segurança > saúde do banco > fluidez**. Ordem das frentes segue risco crescente ao banco (leitura pura primeiro, novo caminho de escrita depois, otimização por último).

### 12.1 As seis frentes avaliadas

| # | Proposta | Decisão |
|---|---|---|
| 1 | Multi-tenancy (multi-clínica) | **Fora.** Uma clínica, dois papéis fixos. Revisitar só depois do sistema pronto. |
| 2 | Trilha de auditoria + LGPD completa | **Aprovada, em versão enxuta** → virou a aba de Histórico (Frente A). Audit-log formal completo fica implícito/futuro. |
| 3 | Busca real (FTS5) + paginação cursor-based | **Aprovada a indexação/paginação** (junto da Frente A). FTS5 fica pra quando a base crescer de verdade — `LIKE` não trava numa base pequena. |
| 4 | Observabilidade / log de erro | **Aprovada** → aba de Logs (Frente B). |
| 5 | Backup automatizado + restore testado | **Fora por enquanto.** Só dado de teste hoje; implementar quando houver dado real. |
| 6 | Cache de catálogo read-heavy | **Aprovada** → Frente C. |

### 12.2 Frente A — Histórico + índices + paginação — CONCLUÍDA (`2026-07-21`)

Ver `10.12` pra detalhe de implementação.

### 12.3 Frente B — Aba de Logs / monitoramento de erro — aprovada, não implementada

Novo caminho de escrita — regra inegociável: **registrar log nunca pode quebrar a resposta da API** (sempre `try/catch` engolindo falha de escrita do log). Plano: tabela `system_logs` (migration `0014`, `level`/`source`/`message`/`detail`/`created_at`, índice por data, retenção de 30 dias), captura em `app.onError` e no scheduler (nunca logar body de request — pode conter senha), rota `adminOnly` `GET/DELETE /api/system-logs`, aba nova em `Admin.jsx`.

### 12.4 Frente C — Cache de catálogo — aprovada, não implementada

Fase 1: cachear `GET /api/settings/public` (Workers Cache API, TTL curto, invalidado em todo `PATCH /settings` ou troca de asset). Fase 2 (opcional, baixo ganho com só dois usuários): catálogos autenticados (protocolos, templates de documento/mensagem) em KV com invalidação write-through.

### 12.5 Processo por frente

Cada frente fecha com: migration própria aplicada e verificada (local + remoto via `sqlite_master`), `npm test` nos dois pacotes, `npm run build` no frontend, `curl` das rotas novas. Validação visual é sempre do usuário. Commit/push/deploy só quando ele pedir.
