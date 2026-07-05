# Status do Projeto CareDesk

Atualizado em: 2026-07-04

Este arquivo e a referencia de estado do projeto com base no codigo local atual.

Objetivo:
- registrar como o sistema funciona hoje de verdade
- diferenciar o que ja esta ativo, o que esta em transicao e o que ainda depende de consolidacao
- servir como ponto de partida para as proximas alteracoes

## 1. Resumo Atual

O CareDesk e um sistema pessoal de acompanhamento pos-operatorio para uso interno de clinica.

Stack atual:
- Frontend: React 18 + Vite + Tailwind + Framer Motion
- Backend: Cloudflare Workers + Hono
- Banco: Cloudflare D1
- Autenticacao: JWT + hash de senha com PBKDF2
- Deploy: Cloudflare Workers + Cloudflare Pages
- Automacao de deploy: GitHub Actions no push para `main`

Ambiente conhecido:
- Frontend principal: `https://caredesk-lou.pages.dev`
- Worker principal: `https://caredesk-worker.faugusto-thecoral.workers.dev`
- Banco D1 remoto ativo
- Scripts locais de deploy funcionando no VS Code

Estado do Git neste momento:
- `main` local esta alinhada com `origin/main` no ultimo commit versionado
- o workspace local possui muitas alteracoes ainda nao commitadas
- portanto, o codigo local esta mais avancado que o GitHub neste momento

## 2. O que o Sistema Faz Hoje

### 2.1 Login e acesso

O sistema hoje autentica por credencial enviada como `email` e `password` no backend, mesmo que a interface ja esteja em transicao visual para um campo mais proximo de "usuario".

Fluxo atual:
1. o usuario acessa `/login`
2. o frontend envia credenciais para `POST /api/auth/login`
3. o worker busca o agente na tabela `agents`
4. o worker valida a senha com PBKDF2
5. se valido, gera um JWT
6. o frontend persiste `token` e `agent` no Zustand
7. chamadas autenticadas seguem com `Authorization: Bearer <token>`

Perfis atuais:
- `admin`
- `agent`

Situacao atual:
- a rota de login tem rate limit por IP implementado
- o endpoint `GET /api/auth/me` ja foi limpo para nao expor mais `telegram_chat_id`
- o login ainda depende do campo `email` do agente no banco

### 2.2 Pacientes

O modulo de pacientes continua sendo o centro do sistema.

Hoje cada paciente trabalha com:
- nome
- telefone
- procedimento
- data da cirurgia
- agente responsavel
- protocolo de contato
- status
- observacoes

Status disponiveis:
- `active`
- `paused`
- `discharged`

Observacao importante:
- o fluxo de paciente no codigo local ja removeu o uso operacional de e-mail
- a API de pacientes local tambem ja deixou de salvar e pesquisar e-mail
- ainda existe legado no dump remoto e em compatibilidades antigas, mas o rumo atual do produto e `telefone + WhatsApp`

Paginas principais:
- `Dashboard`
- `Patients`
- `NewPatient`
- `PatientDetail`
- `WhatsApp`

### 2.3 Contatos e acompanhamento

Hoje o sistema esta sendo consolidado para dois meios operacionais:
- `Ligacao`
- `WhatsApp`

O fluxo atual de contato funciona assim:
1. o paciente possui uma cirurgia e um protocolo associado
2. o sistema calcula os marcos previstos de contato
3. os contatos realizados ficam em `followup_logs`
4. a linha do tempo do paciente mostra progresso, proximos marcos e historico
5. contatos manuais podem ser registrados no detalhe do paciente, no dashboard e na central de WhatsApp

Tipos de contato que ainda aparecem no schema/historico:
- `call`
- `whatsapp`
- `email`
- `in_person`

Observacao:
- `email` ainda existe no historico por compatibilidade com registros antigos
- o fluxo atual do produto nao deve mais criar novos contatos por e-mail

### 2.4 Dashboard

O dashboard local ja esta mais avancado do que a descricao antiga do projeto.

Hoje ele mostra:
- KPIs de pacientes ativos, contatos do dia, atrasados e em dia
- lista de contatos do dia
- selecao individual e em massa
- abertura de contato por `Ligacao` ou `WhatsApp`
- confirmacao antes de registrar o contato no historico
- atividade recente baseada em `notifications`

### 2.5 Central de WhatsApp

A tela `frontend/src/pages/WhatsApp.jsx` hoje e uma central focada em WhatsApp.

Capacidades atuais:
- listar pacientes com filtros
- selecionar varios pacientes
- abrir conversas no `wa.me`
- configurar DDI e intervalo entre abas
- criar, editar e excluir modelos de mensagem
- escolher modelo padrao
- visualizar preview da mensagem
- confirmar depois quais contatos realmente foram enviados para registrar no historico

Configuracoes de WhatsApp armazenadas hoje:
- `whatsapp_enabled`
- `whatsapp_country_code`
- `whatsapp_open_delay_ms`
- `whatsapp_default_template_id`
- `whatsapp_message_templates`

### 2.6 Protocolos de contato

O projeto local ja possui uma base mais rica para protocolos.

Hoje existe:
- tabela `contact_protocols`
- tela administrativa para listar, criar, editar e excluir protocolos
- suporte a protocolo padrao
- suporte a protocolo customizado por paciente
- suporte a dias negativos, dia zero e dias positivos
- suporte a `contact_channel`
- suporte a `message_template` no protocolo

Mas ainda existe uma inconsistencia importante:
- `contact_protocols.days` usa JSON
- `patients.protocol_days` ainda existe como legado/snapshot
- o scheduler e algumas telas ainda precisam ser consolidados em torno de uma unica fonte de verdade

Essa ainda e uma das areas mais importantes do projeto.

### 2.7 Notificacoes e scheduler

O worker possui cron diario ativo.

Estado atual do scheduler local:
1. busca pacientes ativos
2. calcula o proximo marco pendente
3. evita duplicar notificacao do mesmo dia
4. cria registro em `notifications`
5. marca se aquele caso esta pronto para acao manual no WhatsApp

Importante:
- o scheduler local ja nao envia Telegram
- o Telegram saiu do fluxo operacional do codigo
- hoje o scheduler esta mais proximo de um gerador de notificacoes internas do que de um disparador multicanal

### 2.8 Area administrativa

A area administrativa hoje esta organizada em:
- protocolo de contatos
- equipe
- identidade visual

O que ja existe:
- gestao de protocolos
- gestao de agentes/equipe
- temas visuais
- configuracoes gerais da clinica

O que ja saiu do fluxo principal:
- aba operacional de Telegram
- configuracao ativa de envio por e-mail para pacientes

### 2.9 Identidade visual

A identidade visual local esta mais evoluida que o documento antigo indicava.

Hoje existem temas prontos e uma interface visual mais refinada.

Temas conhecidos no projeto:
- Serenidade Costeira
- Jardim Terapeutico
- Luz Dourada
- Terracota Suave
- Lavanda Mineral

Tambem existem alteracoes recentes em:
- `globals.css`
- `tailwind.config.js`
- `frontend/src/theme/`
- `frontend/src/darkPalette.js`

Estado atual:
- a interface ja trabalha com modo escuro e temas mais elegantes
- ainda existe trabalho de refinamento visual e consistencia entre telas

## 3. Estrutura de Dados Atual

### 3.1 Estado do schema local

O schema local em `worker/src/db/schema.sql` hoje define:
- `agents`
- `patients`
- `followup_logs`
- `notifications`
- `contact_protocols`
- `app_settings`
- `login_rate_limit`
- `password_reset_tokens`

Pontos relevantes do schema local:
- `patients` ja nao possui coluna `email`
- `notifications` ja nao possui `sent_telegram` nem `sent_email`
- `telegram_config` ja saiu do schema local

### 3.2 Estado remoto conhecido

O banco remoto ainda esta em transicao.

Foi confirmado anteriormente que o dump remoto ainda continha legado como:
- `patients.email`
- `notifications.sent_telegram`
- `notifications.sent_email`
- tabela `telegram_config`

Por isso foi preparada a migracao:
- `worker/migrations/0001_contact-cleanup.sql`

Essa migracao local foi criada para:
- remover `patients.email`
- reconstruir `notifications` sem flags mortas
- remover `telegram_config`

Observacao critica:
- a migracao existe localmente, mas precisa ser tratada com muito cuidado antes de consolidar no repositório e no ambiente remoto de forma definitiva

### 3.3 Dumps e restauracao

Ja foi criado um fluxo inicial de seguranca operacional:
- bookmark de `Time Travel` registrado localmente
- export remoto completo do D1 salvo em `backups/d1`
- export de schema remoto tentado, mas o Wrangler apresentou limitacao em export concorrente

Isso significa que o projeto local ja entrou em fase de cuidado real com backup e restauracao.

## 4. Estado do Repositorio

### 4.1 GitHub / origin

O `origin/main` hoje aponta para:
- `cb9300f feat: trocar campo email por usuario no login`

Commits recentes versionados:
- `cb9300f feat: trocar campo email por usuario no login`
- `8259726 fix: nao chamar logout() em tentativas de login com 401`
- `11f412d fix: corrigir crash no login quando servidor retorna 401`
- `8123e61 fix: evitar race condition D1 no POST /patients`
- `6b5af21 feat: redesign Patients com tabela clínica MD3`

### 4.2 Workspace local

O workspace local esta significativamente a frente do remoto.

Mudancas locais ja visiveis:
- limpeza do fluxo de e-mail para pacientes
- remocao do Telegram do fluxo operacional
- nova central de WhatsApp
- novas rotas de `protocols` e `whatsapp`
- novos utilitarios em `frontend/src/utils` e `worker/src/utils`
- novo `PatientPanel`
- scripts de deploy e automacao
- nova pasta `worker/migrations`
- `Status.md` ainda nao refletia isso e agora passa a refletir

Conclusao:
- o codigo local e hoje a fonte mais fiel do estado do projeto
- o GitHub ainda nao representa esse estado mais novo

## 5. Deploy e Operacao

### 5.1 Deploy manual

Scripts atuais:
- `scripts/deploy-worker.ps1`
- `scripts/deploy-frontend.ps1`
- `scripts/deploy-all.ps1`

Fluxo atual:
- `deploy-all.ps1` pode fazer commit, push e deploy em sequencia
- ha bloqueio para arquivos sensiveis
- o worker e o frontend podem ser publicados separadamente

### 5.2 Deploy automatico

Existe estrutura em `.github/` no workspace local.

O documento antigo dizia que o workflow de deploy automatico ja existia, e isso continua coerente com a estrutura atual, mas precisa ser revalidado quando o conjunto local for consolidado no GitHub.

### 5.3 Ambiente publicado

Estado conhecido mais recente:
- frontend publicado no Pages
- worker publicado no Workers
- o deploy manual recente funcionou

Porem:
- como ha muitas mudancas locais nao commitadas, o estado do ambiente publicado pode nao ser exatamente igual ao estado atual do workspace

## 6. O que Ja Esta Pronto

- base frontend/backend definida
- autenticacao JWT funcionando no codigo local
- rate limit de login implementado
- painel de pacientes funcional
- detalhe do paciente funcional
- protocolos com interface propria
- central de WhatsApp funcional
- dashboard com acoes em massa
- deploy manual funcional
- base de backup inicial ja com export e bookmark

## 7. O que Esta em Transicao

- consolidacao final do fluxo `Ligacao + WhatsApp`
- saneamento completo do banco remoto
- remocao definitiva de legado de Telegram
- remocao definitiva de legado de e-mail em historicos e compatibilidades
- consolidacao de migracoes D1 no projeto
- sincronizacao entre estado local e repositório GitHub

## 8. Pontos de Atencao

### Alta prioridade

- consolidar protocolos como fonte unica de verdade
- decidir e aplicar a estrategia oficial de migracoes do D1
- alinhar banco remoto ao schema local sem risco de perda
- atualizar o GitHub para refletir o estado local real

### Media prioridade

- quebrar `PatientDetail.jsx`, que continua muito grande
- revisar `Admin.jsx`, que tambem esta grande e acumula responsabilidades
- revisar o scheduler depois da consolidacao dos protocolos
- validar o estado publicado apos consolidar as mudancas locais

### Baixa prioridade

- refinamentos visuais adicionais
- otimizar re-fetches no frontend
- limpar mais compatibilidades antigas quando nao forem mais necessarias

## 9. Direcao Recomendada de Trabalho

Ordem recomendada a partir daqui:
1. consolidar o `Status.md` como espelho do codigo local
2. organizar o conjunto local em blocos claros de alteracao
3. decidir se a migracao `0001_contact-cleanup.sql` sera aplicada agora ou refinada antes
4. estabilizar a regra de negocio dos protocolos
5. so depois seguir com novas features maiores

## 10. Resumo Executivo

Hoje o projeto local ja esta em uma fase mais madura do que o repositório remoto sugere.

O estado real atual e:
- produto orientado a `Ligacao + WhatsApp`
- Telegram fora do fluxo operacional principal
- e-mail de paciente saindo do sistema
- protocolos em evolucao forte, mas ainda nao consolidados
- banco em fase de saneamento controlado
- GitHub atrasado em relacao ao workspace local

Ou seja:
- o projeto esta utilizavel
- o codigo local tem direcao clara
- mas ainda precisamos consolidar estrutura, migracoes e versionamento antes de abrir uma nova frente grande de mudancas
