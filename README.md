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
| `/api/settings` | `settings.js` | Branding, mensageria, templates de e-mail |
| `/api/protocols` | `protocols.js` | Protocolos de contato |
| `/api/message-protocols` | `message-protocols.js` | Modelos de mensagem por marco |
| `/api/document-templates` | `document-templates.js` | Catálogo de documentos |
| `/api/setup` | `setup.js` | Criação do admin inicial (bloqueado em produção) |

Cada rota mora no arquivo de mesmo nome — sem indireção.

### Serviços (`services/`)

- **`scheduler.js`** — as rotinas dos crons: follow-ups do dia e a faxina noturna
- **`daily-digest.js`** — resumo das 20h por agente: desempenho do dia (pessoal, sempre por `agent_id`), atrasados e agenda de amanhã. Atrasados/amanhã são **escopados por papel**: `admin` vê a clínica inteira (como o Dashboard, sem filtro de agente), `agent` só a própria carteira — necessário porque paciente sem `assigned_agent_id` some do resumo de todo mundo se o escopo for sempre "meus pacientes".
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
- `components/LoginCardLayout.jsx` — layout interno do card, com o painel de vidro
- `components/SmokeyBackground.jsx` — fundo animado do login (WebGL puro, sem dependência)
- `components/admin/` — abas de Configurações, incluindo `MessagingTab` e `EmailTemplateEditor`
- `components/patient/` — pedaços de UI compartilhados entre `PatientDetail` (página completa) e `PatientPanel` (drawer resumido em `Patients`): `PatientIdentitySummary`, `PatientNextFollowupCard`, `PatientProtocolTimeline`, `ProtocolDayChips`, `ContactLogEntry`, `PatientDocumentsSection`. Cada um recebe `variant="full"|"compact"` para as duas telas. Dados Clínicos e Ações Rápidas ficam fora de propósito — conteúdo/interação diferem de verdade entre os dois contextos.

> `LoginPageShell.jsx` e `LoginCardLayout.jsx` deveriam estar em
> `components/login/`, mas essa pasta está com a ACL do Windows quebrada — nega
> até escrita em arquivo existente — e a correção exige shell elevado. A versão
> antiga do `LoginCardLayout` continua lá, órfã.

### Tela de login

Três camadas empilhadas, e a ordem importa: **fundo animado** (shader) → **véu
escuro** → **card**. O card não pode ter fundo sólido em nenhum nível, senão o
`backdrop-blur` do painel de vidro filtra esse fundo em vez do shader — foi
exatamente o que um `bg-surface` no `LoginPulsingBorder` causava, deixando o
painel branco e opaco.

O painel de credenciais usa vidro **claro** (`bg-white/10`): camada de branco
translúcido, não escura. Os campos são sublinhados com rótulo flutuante — caixa
com fundo próprio viraria um bloco opaco dentro do vidro.

Cor das ondas (`login_background_color`) e liga/desliga do efeito
(`login_background_effect_enabled`, ligado por padrão) ficam em **Configurações →
Identidade Visual → Fundo animado do login**. Desligado, a tela cai na imagem de
fundo do branding.

Os quatro controles da borda pulsante vão de 0 a `LOGIN_BORDER_MAX` (5), acima do
teto dos presets da biblioteca. A constante mora em `frontend/src/theme/branding.js`
e governa o slider, a validação e a margem entre a borda e o card — mudar o teto
em um lugar só evita que a borda cresça para dentro.

### Temas visuais

`frontend/src/theme/visualThemes.js` define 9 paletas curadas (`VISUAL_THEMES`),
cada uma com `primary`/`secondary`/`tertiary`/`surface`/`neutral` + um `hero`
**escolhido à mão**, não calculado — é a cor de fundo do hero do Dashboard e da
sidebar inteira. Admin escolhe em Configurações → Identidade Visual →
Tema Visual, aplicado ao vivo assim que clica no card (sem precisar salvar) via
`applyThemePaletteWithMode`; sair da aba sem salvar reverte pra cor gravada.

**Hero/sidebar são sempre escuros, em qualquer modo claro/escuro do app** — três
tokens exclusivos, computados de forma idêntica nos dois modos
(`visualThemes.js` e `darkPalette.js`):

| Token | Origem | Uso |
|---|---|---|
| `--color-hero` | `theme.hero` (curado) | fundo do hero e da sidebar |
| `--color-hero-label` | `tertiary`, clareado | rótulos em caixa alta, ícones de KPI |
| `--color-hero-strong` | `primary`, clareado | nome da clínica, item de menu ativo |

Tema sem `hero` definido (cor customizada fora dos 9 presets, digitada direto no
campo de cor) cai num fallback calculado: `mix(secondary, quase-preto, 72%)`.

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

### Custo de consulta: a métrica que importa é `rows_read`

O D1 no plano free dá **5 milhões de linhas lidas por dia**. A cota de leitura
estoura muito antes do espaço, e quem a consome não é o volume de dados — são
consultas que varrem a base.

> **Sobre o limite de espaço, que é fácil de confundir:** o free tem **500 MB
> por banco** e 5 GB somados na conta inteira (até 10 bancos). O CareDesk usa um
> banco só, então o teto real é **500 MB** — os 5 GB só valeriam se o sistema
> fosse dividido em vários bancos. Quando apertar, o caminho é o Workers Paid
> (10 GB por banco), não particionar.

**Regra prática ao escrever qualquer consulta nova:** ela pode ler um número de
linhas proporcional ao *resultado*, nunca proporcional à *base*.

Duas armadilhas concretas, ambas já corrigidas e fáceis de reintroduzir:

**1. Função sobre a coluna mata o índice.**
`date(surgery_date,'+6 months') <= date('now','+30 days')` varre todos os
ativos. O equivalente `surgery_date <= date('now','-6 months','+30 days')` usa
o índice e lê só o que casa. Confirmado por `EXPLAIN QUERY PLAN`: o primeiro dá
`(status=?)`, o segundo `(status=? AND surgery_date<?)`.

**2. `COUNT(*)` para exibir totais.**
O Histórico contava pacientes + contatos a cada página: com a base cheia seriam
~1,8 milhão de linhas por carregamento, e três visitas esgotariam o dia. Hoje
pedimos uma linha a mais que o limite e devolvemos `has_more`. Onde o total é
realmente necessário — pacientes ativos —, ele vive em `system_counters`,
mantido pelas rotas e reconciliado à noite.

### Armadilha de data já resolvida, fácil de reintroduzir

Colunas gravadas pelo JS guardam ISO (`2026-07-25T06:50:31.514Z`); as gravadas
por `datetime('now')` guardam `2026-07-25 18:03:49`. Comparar as duas como texto
**falha em silêncio** — `T` vem depois do espaço, então "vencido" é lido como
"futuro". Sempre envolva a coluna ISO em `datetime()` antes de comparar.

### Ciclo de vida do paciente

Paciente **não é apagado pelo tempo** — aos 6 meses da cirurgia ele é
**arquivado**: sai das listagens e buscas do dia a dia, com os dados intactos.
Apagar de vez só por ação explícita de um admin.

Além do arquivamento automático, **agente e admin podem arquivar e desarquivar a
qualquer momento** — quem faz o contato é quem sabe se o acompanhamento acabou.
As duas ações são reversíveis uma pela outra e não perdem dado, por isso não
exigem admin; **excluir continua restrito a admin**, porque é irreversível.

Pela ficha do paciente (botão "Arquivar" ou a faixa de "Devolver ao
acompanhamento") ou em massa, pelas caixas de seleção na lista — arquivando nas
visões ativas, devolvendo na de arquivados. O desarquivamento **recalcula o
próximo marco**: a data ficou defasada enquanto o paciente esteve fora.

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
que ele registrou permanecem, e continuam creditados a ele pelo nome**: cada
contato guarda `agent_name_snapshot`, gravado no momento em que aconteceu, e a
leitura usa `COALESCE(nome_atual, snapshot)`. Remover os contatos faria o
protocolo do paciente retroceder, como se a ligação nunca tivesse ocorrido; e
deixá-los sem autor faria a ficha clínica creditar uma pessoa como "Sistema
Automático". A interface marca esses registros como *(fora da equipe)*.

O backend recusa excluir a própria conta ou o último administrador ativo.

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
