# CareDesk

Sistema interno de acompanhamento pós-operatório de uma clínica. Um agente
cadastra o paciente, vincula um protocolo de contato, e o sistema calcula os
marcos de acompanhamento e avisa quando cada um vence.

> **Este arquivo descreve o estado atual do sistema.** Para saber *por que* algo
> é como é — decisões, incidentes, alternativas descartadas — veja
> [`Status.md`](Status.md), que é a linha do tempo do projeto.

---

## Escala e papéis

Uma clínica, dois papéis fixos:

- **`agent`** — cadastro, contato, checklist de documentos
- **`admin`** — tudo isso, mais protocolos, equipe, identidade visual, mensageria e logs

Multi-clínica foi avaliado e descartado.

**Alvo de volume:** centenas de milhares de pacientes, 100 a 300 cadastros/dia.
Paciente sai do acompanhamento ativo 6 meses após a cirurgia.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18, Vite, Tailwind (tokens MD3), Framer Motion, Zustand, date-fns |
| Backend | Cloudflare Workers + Hono |
| Banco | Cloudflare D1 (SQLite) |
| Arquivos | Cloudflare R2 (binários) — metadados sempre no D1 |
| Sessão | JWT hand-rolled (Web Crypto) em cookie `HttpOnly` |
| E-mail | Google Apps Script como ponte para o Gmail da clínica |

## Ambientes

- Frontend: <https://caredesk-lou.pages.dev>
- Worker: <https://caredesk-worker.faugusto-thecoral.workers.dev>
- Local: frontend `:5173` (proxy `/api` → `:8787`), worker `:8787`

> **D1 local e D1 remoto são bancos separados.** Dado, credencial e migration
> aplicada em um não existem no outro.

---

## Rodando local

```bash
cd worker   && npm install && npm run db:migrate && npx wrangler dev
cd frontend && npm install && npm run dev
```

Secrets locais ficam em `worker/.dev.vars` (ignorado pelo git): `JWT_SECRET`,
`JWT_REFRESH_SECRET`.

## Publicando

O caminho oficial é o **GitHub Actions** (`Deploy CareDesk`), disparado por push
na `main`. O workflow detecta o escopo e publica só o lado que mudou.

**Migration vai sempre antes do deploy do worker**, senão o código novo procura
tabela que ainda não existe:

```bash
cd worker && npm run db:migrate:remote
git push origin main
```

> **Depois de qualquer migration remota multi-instrução, confirme o resultado
> real via `sqlite_master`.** Nunca confie só no código de saída — já houve
> migration aplicada pela metade sem erro reportado.

---

## Backend — `worker/src/`

### Rotas (`routes/`)

| Rota | Arquivo | O que faz |
|---|---|---|
| `/api/auth` | `auth.js` | Login, refresh, logout, troca e redefinição de senha |
| `/api/patients` | `patients.js` | CRUD, busca, paginação por cursor, documentos do paciente |
| `/api/followups` | `followups.js` | Registro de contatos realizados |
| `/api/agents` | `agents.js` | Equipe, avatares, reset de senha por admin |
| `/api/dashboard` | `dashboard.js` | Indicadores agregados e fila do dia |
| `/api/activity` | `activity.js` | Feed do Histórico, paginado |
| `/api/logs` | `logs.js` | Erros de servidor (admin) |
| `/api/notifications` | `notifications.js` | Notificações internas |
| `/api/settings` | `notifications.js` | Branding, mensageria, templates de e-mail |
| `/api/protocols` | `protocols.js` | Protocolos de contato |
| `/api/message-protocols` | `message-protocols.js` | Modelos de mensagem por marco |
| `/api/document-templates` | `document-templates.js` | Catálogo de documentos |
| `/api/setup` | `setup.js` | Criação do admin inicial (bloqueado em produção) |

> `settings.js` é só um re-export: as rotas de settings moram em
> `notifications.js`. É a única surpresa de organização no backend.

### Serviços (`services/`)

- **`scheduler.js`** — as rotinas dos crons: follow-ups do dia e a faxina noturna
- **`daily-digest.js`** — resumo das 20h por agente (desempenho do dia + agenda de amanhã)
- **`arquivamento.js`** — marca `archived_at` aos 6 meses e avisa os admins
- **`email.js`** — único ponto de saída de e-mail do sistema
- **`error-log.js`** — grava e expira os erros que alimentam a aba de Logs

### Regras (`utils/`)

- **`protocols.js`** — resolução de protocolo e cálculo de marcos. **Fonte única da regra**
- **`proximoMarco.js`** — mantém `next_followup_date` e a expressão SQL de urgência
- **`patientQuery.js`** — busca, cursor, filtros e os status válidos de paciente
- **`contactFields.js`**, **`emailTemplates.js`**, **`messagingSettings.js`**, **`passwordReset.js`**, **`storage.js`**

## Frontend — `frontend/src/`

**Páginas:** `Dashboard`, `Patients`, `PatientDetail`, `NewPatient`, `Historico`,
`Logs` (admin), `Admin` (admin), `Login`, `EsqueciSenha`.

**Componentes de nota:**

- `components/LoginPageShell.jsx` — casca das telas públicas (login e redefinição)
- `components/login/LoginCardLayout.jsx` — layout interno do card
- `components/admin/` — abas de Configurações, incluindo `MessagingTab` e `EmailTemplateEditor`

> `LoginPageShell.jsx` deveria estar em `components/login/`, mas essa pasta está
> com a ACL do Windows quebrada e a correção exige shell elevado.

---

## Banco

**Tabelas:** `agents`, `patients`, `followup_logs`, `notifications`,
`contact_protocols`, `protocol_message_templates`, `document_templates`,
`patient_documents`, `app_settings`, `email_templates`, `login_rate_limit`,
`password_reset_codes`, `error_logs`, `patients_fts`.

### Três decisões de modelagem que valem entender antes de mexer

**1. Índices operacionais são parciais (`WHERE archived_at IS NULL`).**
O que impede a degradação com o tempo não é "ter índice", é o índice cobrir só a
janela ativa (~54k linhas) em vez da base histórica inteira.

**2. `next_followup_date` é materializada; urgência, não.**
Urgência é função de *(próximo marco × hoje)* e mudaria sozinha todo dia,
exigindo um cron varrendo a base. A **data** só muda por evento real, então é
barata de manter — e a urgência sai em SQL na consulta, sem nunca desatualizar.
Toda escrita que afete o marco precisa chamar `recalcularProximoMarco()`; a
faxina reconcilia um lote por noite como rede de segurança.

**3. Busca é FTS5, não `LIKE`.**
`LIKE '%termo%'` não usa índice por construção. `patients_fts` indexa nome,
procedimento e e-mail com remoção de acento ("joao" acha "João"), e **três
triggers** a mantêm em dia — índice externo não se atualiza sozinho, e sem eles
a busca congela e passa a mentir em silêncio. Telefone tem caminho próprio
(`phone_digits`).

### Armadilha de data já resolvida, fácil de reintroduzir

Colunas gravadas pelo JS guardam ISO (`2026-07-25T06:50:31.514Z`); as gravadas
por `datetime('now')` guardam `2026-07-25 18:03:49`. Comparar as duas como texto
**falha em silêncio** — `T` vem depois do espaço, então "vencido" é lido como
"futuro". Sempre envolva a coluna ISO em `datetime()` antes de comparar.

### Ciclo de vida do paciente

Paciente **não é apagado pelo tempo** — aos 6 meses da cirurgia ele é
**arquivado**: sai das listagens e buscas do dia a dia, com os dados intactos.
Apagar de vez só por ação explícita de um admin.

A lista de Pacientes tem três visões: **Em acompanhamento** (padrão),
**Encerrando** (arquivam nos próximos 30 dias) e **Arquivados**. O aviso de
proximidade aparece também no nome do paciente na lista e num alerta no
Dashboard — sem isso, o paciente sumiria de um dia para o outro sem ninguém ver
chegando.

Na API: `archived=none|only|all` e `ending_soon=1`. O campo
`days_until_archive` vem calculado em toda listagem (negativo = já passou da
janela e só falta o cron rodar).

### O que acontece ao excluir

**Paciente** — apaga tudo: contatos registrados, documentos atribuídos,
notificações, entrada do índice de busca e protocolo customizado exclusivo dele.
Feito por `ON DELETE CASCADE` (as foreign keys estão ativas no D1, verificado) e
pelos triggers do FTS. A tela de confirmação lista o que será perdido.

**Agente** — apaga a conta, o avatar no R2 e os códigos de acesso. **Os contatos
que ele registrou permanecem**, com o autor em branco: são histórico clínico do
paciente, e removê-los faria o protocolo retroceder, como se o contato nunca
tivesse acontecido. O backend recusa excluir a própria conta ou o último
administrador ativo.

### Domínios

- `patients.status`: `active` · `paused` · `discharged`
- `followup_logs.contact_type`: `call` · `whatsapp` · `email` · `in_person`
- `followup_logs.outcome`: `reached` · `no_answer` · `callback_scheduled`
- urgência (derivada): `overdue` · `due` · `soon` · `ok` · `none`

---

## Automação (crons)

Horários em UTC no `wrangler.toml`; Fortaleza é UTC-3 o ano inteiro.

| Cron | Local | Rotina |
|---|---|---|
| `0 11 * * *` | 08h | Follow-ups do dia → notificações internas |
| `0 23 * * *` | 20h | Resumo diário por agente, por e-mail |
| `0 3 * * *` | 00h | Faxina: logs, códigos, rate limit, arquivamento, reconciliação, `ANALYZE` |

## Segurança

- Sessão em cookie `HttpOnly` + `Secure` + `SameSite=None` (front e worker são domínios diferentes)
- Access token 15min, refresh 7 dias
- PBKDF2 100k iterações, verificação timing-safe
- Rate limit por IP **e** por e-mail: 5 tentativas, 15 min de bloqueio, com `Retry-After`
- Respostas genéricas no fluxo de senha, para não permitir enumerar contas
- Token do relay de e-mail nunca sai em claro da API, e some inteiro para não-admin

## Mensageria

E-mail sai pelo Gmail da clínica via Apps Script — o Workers não abre conexão
SMTP, então **senha de app do Gmail não serve aqui**. Configuração e modelos
ficam em **Configurações → Mensageria**. Publicação do script:
[`docs/EMAIL-APPS-SCRIPT.md`](docs/EMAIL-APPS-SCRIPT.md).

---

## Prioridade do projeto

**segurança > saúde do banco > fluidez**
