# Status do Projeto CareDesk

Atualizado em: 2026-07-12

Este arquivo registra como o CareDesk funciona hoje de verdade no codigo local.

## 1. Resumo Atual

O CareDesk e um sistema pessoal de acompanhamento pos-operatorio para uso interno de clinica.

Stack atual:
- Frontend: React 18 + Vite + Tailwind + Framer Motion
- Backend: Cloudflare Workers + Hono
- Banco: Cloudflare D1
- Autenticacao: JWT + hash de senha com PBKDF2
- Deploy: Cloudflare Workers + Cloudflare Pages

Ambiente conhecido:
- Frontend principal: `https://caredesk-lou.pages.dev`
- Worker principal: `https://caredesk-worker.faugusto-thecoral.workers.dev`
- Banco D1 remoto ativo

Estado do Git:
- `main` local alinhada ao ultimo commit versionado do remoto
- workspace local com muitas alteracoes ainda nao commitadas
- o codigo local continua sendo a fonte mais fiel do estado atual

## 2. O que o Sistema Faz Hoje

### 2.1 Login e acesso

Fluxo atual:
1. usuario acessa `/login`
2. frontend envia credenciais para `POST /api/auth/login`
3. worker busca o agente na tabela `agents`
4. worker valida a senha com PBKDF2
5. se valido, gera um JWT
6. frontend persiste `token` e `agent`
7. chamadas autenticadas usam `Authorization: Bearer <token>`

Perfis atuais:
- `admin`
- `agent`

### 2.2 Pacientes

Cada paciente trabalha hoje com:
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

Paginas principais:
- `Dashboard`
- `Patients`
- `NewPatient`
- `PatientDetail`

### 2.3 Contatos e acompanhamento

Fluxo atual:
1. paciente possui cirurgia e protocolo associado
2. sistema calcula marcos previstos
3. registros realizados ficam em `followup_logs`
4. linha do tempo mostra progresso, proximos marcos e historico
5. contatos sao registrados manualmente no detalhe do paciente ou pelo dashboard

Tipos de contato ainda suportados pelo historico:
- `call`
- `email`
- `whatsapp`
- `in_person`

Observacao:
- o modulo de mensagens foi retirado desta fase do produto
- o painel permanece centrado em ligacao, protocolo e notificacoes internas

### 2.4 Dashboard

Hoje o dashboard mostra:
- KPIs de pacientes ativos, contatos do dia, atrasados e em dia
- lista de contatos do dia
- selecao individual e em massa
- abertura de ligacao
- confirmacao para registrar contato no historico
- atividade recente baseada em `notifications`

### 2.5 Protocolos de contato

Hoje existe:
- tabela `contact_protocols`
- tabela `protocol_message_templates`
- tela administrativa para listar, criar, editar e excluir protocolos
- aba administrativa para criar mensagens ligadas aos marcos do protocolo
- protocolo padrao
- protocolo customizado por paciente
- dias negativos, dia zero e dias positivos

Atualizacao local mais recente:
- o backend centraliza a resolucao de protocolo em uma unica regra
- ordem oficial local: protocolo vinculado -> protocolo padrao -> `app_settings.contact_protocol_days` -> legado `patients.protocol_days` apenas como compatibilidade final
- scheduler e rotas de pacientes compartilham a mesma logica de resolucao
- o detalhe do paciente agora tambem resolve a mensagem do proximo marco, quando existir template para `protocol_id + day_offset`

### 2.6 Notificacoes e scheduler

O worker possui cron diario ativo.

Estado atual do scheduler:
1. busca pacientes ativos
2. calcula o proximo marco pendente
3. evita duplicar notificacao do mesmo dia
4. cria registro em `notifications`

Estado funcional:
- scheduler gera notificacoes internas
- nao ha canal de mensagem operacional ativo nesta fase

### 2.7 Area administrativa

A area administrativa hoje esta organizada em:
- protocolos de contato
- equipe
- identidade visual

O que ja existe:
- gestao de protocolos
- gestao de agentes
- avatar de agentes com upload/remocao em edicao
- temas visuais
- configuracoes gerais da clinica
- branding publico do login em fase final de consolidacao para nao depender mais de sessao autenticada

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

Pontos relevantes:
- `agents` agora possui `avatar_url` e `avatar_storage_key`
- `patients` nao possui coluna `email`
- `notifications` nao possui mais flags operacionais de mensagem no schema local novo
- o schema foi alinhado para a fase sem modulo de mensagens

### 3.2 Estado remoto conhecido

O remoto passou por saneamento estrutural nesta rodada.

Resultado confirmado:
- schema remoto limpo de campos legados estruturais da fase anterior
- nenhum paciente remoto ficou sem `protocol_id`
- protocolo vinculado passou a prevalecer sobre snapshots legados

### 3.3 Dumps e restauracao

Ja existe fluxo inicial de seguranca operacional:
- bookmark de `Time Travel` registrado localmente
- export remoto completo do D1 salvo em `backups/d1`

Aprendizados importantes:
- comandos remotos do D1 precisam de `--remote`
- imports SQL remotos pelo Wrangler nao devem usar `BEGIN TRANSACTION` / `COMMIT`

## 4. Estado do Repositorio

### 4.1 GitHub / origin

O repositório remoto ainda nao representa todo o estado local atual.

### 4.2 Workspace local

Mudancas locais relevantes visiveis:
- consolidacao do fluxo de protocolos
- simplificacao do sistema para operacao sem modulo de mensagens
- nova pasta `worker/migrations`
- base de `avatars/agents` sobre `R2` compartilhado
- ajustes visuais ainda nao consolidados
- documentacao local mais atual que o GitHub
- limpeza de arquivos orfaos e artefatos temporarios locais
- correcao do flash inicial de branding antigo no carregamento autenticado do frontend
- abertura de rota publica sanitizada de branding para a tela de login
- rework da miniatura de preview do login para espelhar imagem institucional + card real de acesso

Conclusao:
- o codigo local e a fonte mais fiel do estado atual
- o GitHub ainda esta atrasado

## 5. Deploy e Operacao

### 5.1 Deploy manual

Scripts atuais:
- `scripts/deploy-worker.ps1`
- `scripts/deploy-frontend.ps1`
- `scripts/deploy-all.ps1`

### 5.2 Ambiente publicado

Estado conhecido:
- frontend publicado no Pages
- worker publicado no Workers
- validacao funcional publicada executada em `2026-07-11`
- dashboard, pacientes, detalhe do paciente e admin abriram corretamente no dominio publicado
- worker publicado respondeu `200` em `/health`
- rotas antigas `/api/whatsapp` e `/api/telegram` responderam `404`
- frente de `avatars/agents` e imagem exclusiva da pagina de login publicada em `2026-07-11`
- workflow `.github/workflows/deploy.yml` reforcado para validar secrets da Cloudflare e instalar `wrangler` no job de frontend

Porem:
- como ha muitas mudancas locais nao commitadas, o ambiente publicado pode nao refletir exatamente cada detalhe fino do workspace atual

## 6. O que Ja Esta Pronto

- base frontend/backend definida
- autenticacao JWT funcionando no codigo local
- rate limit de login implementado
- painel de pacientes funcional
- detalhe do paciente funcional
- protocolos com interface propria
- dashboard funcional
- deploy manual funcional
- base inicial de backup ja criada

## 7. O que Esta em Transicao

- consolidacao final dos protocolos como fonte unica de verdade
- remocao de compatibilidades antigas que ainda nao sao mais necessarias
- sincronizacao entre estado local e repositório GitHub
- consolidacao final de versionamento para alinhar workspace, GitHub e ambiente publicado

## 8. Pontos de Atencao

### Alta prioridade

- consolidar protocolos como fonte unica de verdade
- revisar se `patients.protocol_days` ja pode entrar na fila de remocao definitiva
- atualizar o GitHub para refletir o estado local real
- aplicar a migration `0005_login-background.sql` no D1 remoto antes do proximo deploy oficial (ver secao 11.27)

### Media prioridade

- quebrar `PatientDetail.jsx`, que continua muito grande
- revisar `Admin.jsx`, que tambem esta grande e acumula responsabilidades
- reduzir o tempo de estado `Carregando ambiente...` na rota `/patients`, se quisermos um boot ainda mais direto
- revisar se ainda existe alguma diferenca fina entre branding remoto e dados locais de `app_settings`
- acompanhar o impacto de bundle apos importar o shader do login de forma estatica; o build passou, mas o bundle principal ficou acima de `500 kB`

## 9. Aprendizados Mais Recentes

- a tela publica `/login` nao carregava ajustes de branding porque `frontend/src/App.jsx` encerrava o bootstrap ao detectar ausencia de token
- `GET /api/settings` continuou autenticado; o worker agora precisa manter uma leitura publica separada e sanitizada para branding
- o preview anterior da aba de identidade visual induzia erro de leitura, porque a imagem e a borda estavam separadas em dois blocos distintos
- a borda pulsante estava tecnicamente renderizada para configuracoes locais, mas a faixa visivel do card era pequena demais para transmitir o efeito com clareza
- o workflow de deploy do repositorio estava fragil no frontend porque chamava `npx wrangler pages deploy` sem garantir o CLI instalado naquele job
- quando os secrets da Cloudflare nao estiverem presentes, o CI agora deve falhar com mensagem objetiva em vez de erro opaco mais adiante
- a tela publica de login precisa esperar o branding remoto publico antes do primeiro paint util, ou a identidade visual aparece como regressao mesmo com os dados corretos salvos
- a aba de identidade visual ficou mais coerente quando a preview duplicada do card foi removida e a composicao completa passou a ser a referencia unica
- o shader do login precisa envolver o card principal inteiro da tela, enquanto o acabamento glass deve ficar restrito a coluna direita; qualquer outra distribuicao distorce a intencao visual

### Baixa prioridade

- refinamentos visuais adicionais
- otimizar re-fetches no frontend

## 9. Direcao Recomendada de Trabalho

Ordem recomendada:
1. consolidar `README.md` e `Status.md` como espelho do estado real
2. organizar o conjunto local em blocos claros de alteracao
3. estabilizar a regra de negocio dos protocolos
4. separar commits de backend/migracao e frontend/branding
5. validar o ambiente publicado
6. so depois seguir com novas features maiores

## 10. Resumo Executivo

Estado real atual:
- produto orientado a acompanhamento interno
- modulo de mensagens pausado
- protocolos em consolidacao
- banco remoto saneado estruturalmente
- ambiente publicado validado nas rotas principais
- GitHub atrasado em relacao ao workspace local

Ou seja:
- o projeto esta utilizavel
- o codigo local tem direcao clara
- ainda precisamos consolidar versionamento e validacao publicada antes de abrir uma nova frente grande de mudancas

## 11. Aprendizados Operacionais Recentes

### 11.35 Direcao visual `Luxo Clinico` para o fundo do login

Decisao desta rodada:
- o fundo externo da tela de login deixou de depender de um preto quase chapado
- a direcao escolhida foi `Luxo Clinico`, com base azul-petroleo profunda, halos frios suaves e atmosfera mais editorial

Implementacao aplicada:
- o login publico passou a usar um helper compartilhado para montar o background da pagina
- a miniatura da aba `Identidade Visual` passou a reutilizar essa mesma atmosfera externa
- isso reduz divergencia entre preview administrativa e tela real publicada

Regra consolidada:
- imagem de fundo configurada continua sendo respeitada quando existir
- sem imagem, a pagina ainda deve parecer premium, e nao vazia ou triste
- o background externo agora virou parte da linguagem visual oficial do login, nao apenas um fallback neutro

### 11.36 Correcao do workflow para deploy isolado de frontend

Problema confirmado:
- o workflow oficial `Deploy CareDesk` aceitava `target=frontend`, mas mesmo assim o job `Deploy Frontend` ficava `skipped`
- o mesmo ocorreu em push normal de alteracao apenas no frontend

Causa raiz:
- o job `Deploy Frontend` ainda carregava `needs: [changes, deploy-worker]`
- no GitHub Actions, um job preso a outro job opcional e pulado pode ser descartado antes mesmo de o `if` conseguir liberar a execucao

Correcao aplicada:
- `Deploy Frontend` agora depende apenas de `changes`
- a decisao de publicar o frontend volta a ser guiada unicamente por `needs.changes.outputs.deploy_frontend`

Regra consolidada:
- deploy de frontend puro nao deve esperar worker
- deploy de worker puro nao deve bloquear Pages
- o escopo detectado passou a ser a unica fonte de verdade para decidir se o Pages publica ou nao

### 11.37 Protocolo de mensagens ligado aos marcos do protocolo

Escopo entregue:
- nova aba `Protocolo de Mensagens` ao lado de `Protocolo de Contatos`
- cada mensagem fica vinculada a um protocolo real e a um marco real desse protocolo
- o modal `Registrar Contato` agora mostra a mensagem correspondente ao proximo marco do paciente, quando ela existir

Modelo escolhido:
- tabela nova: `protocol_message_templates`
- unicidade por `protocol_id + day_offset`
- cada template guarda `title`, `content` e `contact_type`

Motivo da modelagem:
- a mensagem continua sendo regra do protocolo, e nao dado solto do paciente
- isso garante consistencia entre pacientes que compartilham o mesmo protocolo

Placeholders suportados:
- `{{patient_name}}`
- `{{patient_phone}}`
- `{{procedure}}`
- `{{surgery_date}}`
- `{{assigned_agent_name}}`
- `{{clinic_name}}`
- `{{protocol_name}}`
- `{{milestone_label}}`
- `{{milestone_date}}`
- `{{contact_date}}`

Comportamento operacional:
- se o proximo marco do paciente tiver template cadastrado, o sistema exibe a mensagem renderizada no registro de contato
- o agente pode copiar a mensagem ou jogar o texto nas observacoes do registro
- se o marco existir, mas ainda nao houver template, a interface avisa explicitamente que falta cadastrar essa mensagem

### 11.1 Fluxo local mais eficiente

Para mudancas predominantemente visuais ou de produto:
1. subir o projeto inteiro localmente
2. validar login e rotas principais
3. fazer um bloco maior de refinamentos no `localhost`
4. so no fim rodar build final, commit e deploy

### 11.2 Subida local validada

Frontend local:
- `http://localhost:5173`

Backend local:
- `http://localhost:8787`

Credenciais locais validadas:
- usuario: `admin`
- senha: `CareDesk2026!`

### 11.3 Procedimento local que funcionou

1. confirmar em `frontend/vite.config.js` que o frontend sobe na porta `5173`
2. confirmar que `/api` aponta para `http://localhost:8787`
3. verificar se as portas `5173` e `8787` estao livres
4. inicializar o D1 local com `npx wrangler d1 execute caredesk-sprint --local --file=src/db/schema.sql`
5. subir o frontend com `npm run dev`
6. subir o worker com variaveis explicitas de desenvolvimento
7. confirmar resposta HTTP do frontend e do worker
8. criar ou sobrescrever o admin local
9. testar login antes de iniciar a rodada principal

### 11.4 Armadilhas encontradas

- nao assumir que o frontend local sozinho basta quando a UI depende de API proxied
- nao assumir que scripts antigos continuam corretos depois de renomear banco ou binding
- sem `JWT_SECRET` e `APP_ENV=development`, o worker local pode falhar no login
- antes de anunciar `localhost` como pronto, validar frontend, worker e login

### 11.5 Comando local mais confiavel para o worker

```powershell
npx wrangler dev --local --var JWT_SECRET:dev-caredesk-local-secret-2026 --var APP_ENV:development
```

### 11.6 Pendencia aberta para a proxima sessao

A versao local ficou funcional, mas ainda nao espelhou corretamente o estado visual da online.

Hipoteses principais:
- diferenca entre `app_settings` local e remoto
- URLs divergentes de branding
- assets externos nao refletidos no ambiente local

### 11.7 Limpeza de arquivos orfaos desta rodada

Arquivos removidos por nao fazerem mais parte do fluxo real do projeto:
- `worker/reset-admin-password.mjs`
- `worker/wrangler.toml.example`
- residuos locais em `.codex/runtime/`

Decisao operacional aplicada:
- `.codex/` agora fica ignorado no `.gitignore` para evitar que logs, testes locais e artefatos temporarios voltem a poluir o workspace

### 11.8 Correcao de boot visual desta rodada

Sintoma observado:
- ao abrir o frontend publicado autenticado, a interface carregava primeiro com branding antigo/default e so depois atualizava para o branding real vindo da API.

Causa identificada:
- o frontend renderizava a area autenticada com defaults locais antes do retorno de `api.settings.get()`.
- havia tambem busca duplicada de configuracoes no `App.jsx` e no `AppLayout.jsx`.

Correcao aplicada:
- o render autenticado agora espera o carregamento inicial das configuracoes antes do primeiro paint principal.
- a busca duplicada no `AppLayout.jsx` foi removida.

### 11.9 Validacao publicada apos deploy

Validacao feita em `2026-07-11` no frontend `https://caredesk-lou.pages.dev` e no worker `https://caredesk-worker.faugusto-thecoral.workers.dev`.

Resultado:
- dashboard abriu com o branding atual sem reproduzir o flash da versao antiga observado antes
- rota `/patients` carregou um estado curto de `Carregando ambiente...` e depois estabilizou normalmente
- detalhe do paciente abriu com protocolo resolvido, linha do tempo e acoes rapidas disponiveis
- admin abriu com protocolos, equipe e identidade visual sem exibicao de modulo de mensagens
- nenhuma tela validada mostrou termos ou acoes de WhatsApp, Telegram ou mensagens
- console sem erros ou warnings relevantes nas telas validadas
- `GET /health` respondeu `200` com `{\"status\":\"ok\",\"app\":\"CareDesk\"}`
- `GET /api/whatsapp` respondeu `404`
- `GET /api/telegram` respondeu `404`

### 11.10 Correcao de favicon

Sintoma observado:
- o favicon configurado na aba de branding nao subia corretamente na aba do navegador, que continuava exibindo um icone antigo ou residual

Causa mais provavel consolidada:
- o `index.html` nao publicava um favicon base
- o frontend atualizava apenas um unico `link[rel='icon']`
- alguns navegadores mantem cache ou priorizam combinacoes como `shortcut icon` e `apple-touch-icon`

Correcao aplicada:
- `frontend/index.html` agora define um favicon base inline do CareDesk
- `frontend/src/App.jsx` agora aplica o favicon resolvido em `icon`, `shortcut icon` e `apple-touch-icon`
- o runtime tambem passou a inferir o `type` do asset para reduzir interpretacoes erradas do navegador

Validacao local:
- `npm run build` do frontend executado com sucesso em `2026-07-11`

### 11.11 Diretriz atual para storage

Decisao consolidada nesta fase:
- o storage da Cloudflare deve ficar focado em arquivos pesados, especialmente imagens

Casos indicados:
- logo
- imagem de fundo
- imagem exclusiva da pagina de login
- favicon
- imagem de usuario, quando essa feature entrar
- imagens e anexos visuais em geral

Casos nao indicados como fonte principal:
- dados cadastrais
- prontuario estruturado
- protocolos
- contatos e eventos operacionais

Regra arquitetural escolhida:
- `R2` para binarios grandes
- `D1` para metadados, relacoes, permissoes e dados operacionais

Melhor caminho daqui para frente:
- expandir o uso do storage primeiro para imagens de perfil e anexos visuais
- evitar escopo maior de documentos clinicos completos antes de definir ACL, auditoria e backup externo

### 11.12 Organizacao de fluxos para storage

Objetivo desta organizacao:
- preparar a base para novos ajustes visuais sem espalhar arquivos e regras de upload de forma inconsistente

Estrutura recomendada de namespaces no `R2`:
- `branding/logos/`
- `branding/backgrounds/`
- `branding/login-images/`
- `branding/favicons/`
- `avatars/agents/`
- `avatars/patients/`
- `attachments/patients/`

Responsabilidade por camada:
- `R2`: binarios e imagens
- `D1`: metadados, relacoes, ownership, contexto e permissoes
- `Worker`: validacao, upload, leitura, substituicao e remocao
- `Frontend`: consumo das URLs servidas pela API e preview local antes do upload

Fluxo ideal consolidado:
1. frontend envia arquivo ao worker
2. worker valida contexto, tipo e tamanho
3. worker grava no `R2` com chave unica
4. worker salva no `D1` a referencia do arquivo
5. frontend consome a URL final retornada pela API

Ordem recomendada para seguir sem bagunca:
1. manter branding como caso oficial de referencia
2. unificar o contrato de assets do worker
3. adicionar `avatars/agents`
4. adicionar `avatars/patients`
5. so depois abrir anexos visuais de pacientes

Decisao importante:
- ajustes visuais futuros devem preferir reusar esse fluxo organizado em vez de criar campos soltos ou URLs manuais em tabelas de negocio

Beneficio direto para a frente visual:
- logo, background, favicon e futuros avatares passam a seguir um mesmo padrao tecnico
- isso reduz retrabalho de cache, preview, remocao e fallback visual

### 11.13 Implementacao inicial de avatars para agentes

Escopo entregue:
- backend ganhou fluxo proprio para `avatars/agents`
- branding e avatar passaram a compartilhar o mesmo utilitario de storage em `worker/src/utils/storage.js`
- `agents` agora expoe `avatar_url` nas rotas de login, `me` e listagem da equipe
- admin permite upload e remocao de avatar ao editar agentes
- sidebar autenticada e lista de equipe agora renderizam avatar real com fallback por iniciais

Rotas novas:
- `POST /api/agents/:id/avatar`
- `DELETE /api/agents/:id/avatar`
- `GET /api/agents/avatar/:key`

Arquivos principais desta entrega:
- `worker/migrations/0002_agent-avatars.sql`
- `worker/src/routes/agents.js`
- `worker/src/routes/auth.js`
- `worker/src/utils/storage.js`
- `frontend/src/components/common/Avatar.jsx`
- `frontend/src/pages/Admin.jsx`
- `frontend/src/components/layout/AppLayout.jsx`

Validacao local desta rodada:
- `frontend`: `npm run build` ok em `2026-07-11`
- `worker`: `npm test` ok em `2026-07-11`

### 11.14 Imagem exclusiva para a pagina de login

Escopo entregue:
- a tela de login agora pode usar uma imagem exclusiva, separada da imagem de fundo geral do painel
- esse asset segue a diretriz oficial e fica no `R2`
- a aba de identidade visual ganhou campo proprio de upload/remocao e preview dedicado da tela de login

Contrato consolidado:
- chave de configuracao: `login_image_url`
- chave interna de storage: `login_image_storage_key`
- namespace no storage: `branding/login-images/`

Regra de fallback:
- se `login_image_url` estiver vazio, a tela de login fica sem imagem

Arquivos principais desta frente:
- `worker/migrations/0003_login-branding.sql`
- `worker/src/routes/notifications.js`
- `frontend/src/theme/branding.js`
- `frontend/src/components/admin/BrandingSettingsTab.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/store/index.js`

Validacao local:
- `frontend`: `npm run build` ok em `2026-07-11`
- `worker`: `npm test` ok em `2026-07-11`

### 11.16 Ajuste de fallback da imagem de login

Decisao refinada:
- a tela de login nao deve puxar automaticamente a imagem de fundo geral quando `login_image_url` estiver vazio
- ausencia de imagem definida no login agora significa tela sem imagem

Motivo:
- isso deixa o comportamento mais previsivel e evita heranca visual indesejada entre painel interno e tela de acesso

Validacao local:
- `frontend`: `npm run build` ok em `2026-07-11`

Estado publicado:
- correcao publicada no frontend em `2026-07-11`
- deployment URL desta subida: `https://21c0a90e.caredesk-lou.pages.dev`
- `GET https://caredesk-lou.pages.dev/login` respondeu `200`

### 11.17 Especificacao da borda pulsante no login

Decisao desta rodada:
- a borda animada inspirada no shader de `PulsingBorder` foi considerada viavel para o CareDesk
- a aplicacao recomendada e somente no card de login da direita
- a imagem institucional da esquerda nao deve receber esse efeito

Limite de usabilidade definido:
- o efeito nao pode competir com a imagem de login
- o efeito nao deve invadir o container inteiro da tela
- o foco visual precisa continuar em login, contraste e legibilidade

Configuracoes que devem existir na aba de identidade visual:
- habilitar/desabilitar o efeito
- preset
- cor 1
- cor 2
- cor 3
- cor de fundo do shader
- intensidade
- velocidade
- espessura
- bloom

Configuracoes que nao devem entrar nesta primeira fase:
- spots
- smoke
- rotation
- scale
- offset
- aspect ratio manual

Fallback comportamental definido:
- sem suporte ou com erro no shader, o card continua com borda estatica
- com `prefers-reduced-motion`, o efeito deve ser reduzido ou neutralizado

Proxima implementacao recomendada:
- instalar e validar a dependencia do shader
- criar wrapper local do componente
- ligar apenas ao card de login
- expor configuracoes enxutas na aba de identidade visual

### 11.18 Validacao concreta da biblioteca do shader

O que deixou de ser hipotese:
- `@paper-design/shaders-react` foi instalada com sucesso no frontend
- o pacote publicado realmente exporta `PulsingBorder`
- o componente vem com presets reais publicados:
  - `Default`
  - `Circle`
  - `Northern lights`
  - `Solid line`

Props principais confirmadas no pacote instalado:
- `colors`
- `colorBack`
- `roundness`
- `thickness`
- `softness`
- `aspectRatio`
- `intensity`
- `bloom`
- `spots`
- `spotSize`
- `pulse`
- `smoke`
- `smokeSize`
- `speed`
- `scale`

Conclusao refinada:
- a frente e viavel tecnicamente no stack atual
- a decisao de manter um wrapper local do CareDesk continua correta
- a decisao de expor poucas configuracoes na aba de identidade visual continua correta

### 11.19 Implementacao inicial da borda pulsante no login

Escopo entregue:
- shader conectado apenas ao card de login
- configuracoes principais expostas na aba de identidade visual
- preview do card com efeito dentro da propria tela administrativa
- configuracoes persistidas em `app_settings`

Chaves adicionadas:
- `login_border_effect_enabled`
- `login_border_preset`
- `login_border_color_1`
- `login_border_color_2`
- `login_border_color_3`
- `login_border_color_back`
- `login_border_intensity`
- `login_border_speed`
- `login_border_thickness`
- `login_border_bloom`

Arquivos principais desta entrega:
- `worker/migrations/0004_login-border-settings.sql`
- `worker/src/routes/notifications.js`
- `worker/src/db/schema.sql`
- `frontend/src/theme/branding.js`
- `frontend/src/components/ui/LoginPulsingBorder.jsx`
- `frontend/src/components/admin/BrandingSettingsTab.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/store/index.js`

Decisao tecnica importante:
- o wrapper local foi simplificado para import estatico do shader
- a troca reduz risco de falha silenciosa na renderizacao, mas aumentou o bundle principal e precisa ser acompanhada

Validacao local:
- `frontend`: `npm run build` ok em `2026-07-11`
- `worker`: `npm test` ok em `2026-07-11`

Estado publicado:
- migracao remota `0004_login-border-settings.sql` aplicada em `2026-07-11`
- worker publicado em `https://caredesk-worker.faugusto-thecoral.workers.dev`
- frontend publicado em `https://caredesk-lou.pages.dev`
- deployment URL desta subida: `https://4af79593.caredesk-lou.pages.dev`
- `GET /health` respondeu `200`
- `GET https://caredesk-lou.pages.dev/login` respondeu `200`

### 11.20 Refino final do login premium

Estado local consolidado em `2026-07-12`:
- a borda pulsante foi reposicionada para envolver o container principal completo da tela de login
- o efeito glass ficou restrito apenas a coluna direita de autenticacao
- a coluna institucional da esquerda continua solida para preservar leitura, contraste e utilidade da imagem exclusiva do login
- a miniatura da aba de identidade visual passou a seguir a mesma composicao estrutural da tela publica

Decisao visual importante:
- o melhor resultado nao e transformar toda a tela em glass
- o contraste premium correto neste projeto e glow no card principal inteiro + glass apenas na faixa de credenciais

Observacao operacional sobre publicacao:
- deploy local por `scripts/deploy-frontend.ps1` ou `scripts/deploy-worker.ps1` publica no Cloudflare
- esses deploys manuais nao aparecem no GitHub Actions
- o `Actions` mostra apenas runs do workflow versionado no GitHub, disparados por `push` ou `workflow_dispatch`

### 11.21 Ajuste do fluxo oficial de publicacao

Consolidado em `2026-07-12`:
- o workflow `.github/workflows/deploy.yml` passou a se chamar `Deploy CareDesk`
- o workflow ganhou `run-name` mais legivel para ajudar no acompanhamento da evolucao
- a regra de concorrencia foi ajustada para `cancel-in-progress: false`
- o grupo de concorrencia agora segue a branch, mas sem cancelar o run anterior

Impacto esperado no GitHub Actions:
- novos deploys deixam de parecer substituidos no proprio historico do workflow
- a leitura da evolucao por publicacao fica mais proxima do padrao visto em outros projetos com uso intensivo de `Actions`
- o historico continua dependente de `push` e `workflow_dispatch`; deploy manual local segue fora dessa trilha

Clarificacao operacional adicionada ao projeto:
- `scripts/deploy-worker.ps1` e `scripts/deploy-frontend.ps1` agora avisam explicitamente que sao fluxos manuais
- `package.json` ganhou aliases `deploy:manual:*` para deixar clara a natureza desses comandos
- `README.md` agora define o GitHub Actions como trilha oficial de historico de publicacao

### 11.22 Regressao explicada do login premium

Causa raiz confirmada em `2026-07-12`:
- o login premium havia sido publicado manualmente no Cloudflare
- depois disso, um `push` menor acionou o `GitHub Actions`
- o workflow republicou o estado do repositorio, que ainda nao continha todo o pacote visual do login
- resultado: a producao voltou para um estado anterior da tela de login

Regra operacional endurecida:
- nenhuma mudanca visual critica pode ficar apenas no deploy manual
- o estado canonico do produto precisa morar no GitHub antes do proximo deploy oficial

Pacote minimo que precisa andar junto para o login premium nao regredir:
- `frontend/src/App.jsx`
- `frontend/src/services/api.js`
- `frontend/src/store/index.js`
- `frontend/src/theme/branding.js`
- `frontend/src/pages/Login.jsx`
- `frontend/src/components/admin/BrandingSettingsTab.jsx`
- `frontend/src/components/ui/LoginPulsingBorder.jsx`
- `frontend/package.json`
- `frontend/package-lock.json`
- `worker/src/routes/notifications.js`
- `worker/src/utils/storage.js`
- `worker/src/db/schema.sql`
- `worker/migrations/0003_login-branding.sql`
- `worker/migrations/0004_login-border-settings.sql`

Decisao:
- a correcao definitiva e publicar esse pacote coordenado no GitHub, e nao apenas reaplicar deploy manual no Cloudflare

### 11.23 Alinhamento de revisionamento

Objetivo desta rodada:
- reduzir a distancia entre o workspace local e o estado versionado do GitHub
- transformar as frentes ja consolidadas localmente em commits rastreaveis e publicados

Critério adotado:
- commits por bloco funcional real
- testes e build executados antes do fechamento
- evitar deixar backend, frontend e migracoes relacionadas separadas artificialmente

Meta operacional:
- apos esta rodada, o repositório deve refletir com fidelidade o estado local relevante do produto

### 11.24 Correcao do escopo da borda pulsante

Validado em `2026-07-12`:
- a versao online ainda estava com o efeito preso apenas ao bloco da direita
- isso contrariava a decisao consolidada de glow no card principal inteiro

Correcao aplicada:
- `frontend/src/pages/Login.jsx` agora envolve o card principal inteiro com `LoginPulsingBorder`
- a coluna direita continua com glass e o bloco institucional da esquerda continua solido
- `frontend/src/components/admin/BrandingSettingsTab.jsx` passou a reproduzir o mesmo comportamento na miniatura

Resultado esperado:
- o shader fica visivel no contorno do login completo
- a preview administrativa volta a ser uma referencia fiel da tela publicada

### 11.25 Simplificacao da coluna direita do login

Validado em `2026-07-12`:
- havia um container extra envolvendo toda a coluna direita
- esse bloco criava borda redundante e deixava o layout mais pesado que o necessario

Correcao aplicada:
- o wrapper estrutural externo da coluna direita foi removido
- o conteudo de acesso permanece centralizado
- a caixa interna do formulario continua como unico agrupamento funcional visivel

Refino adicional:
- as bordas restantes marcadas visualmente como ruido tambem foram removidas
- a coluna direita ficou sem moldura estrutural externa e sem caixa interna do formulario
- a organizacao visual agora depende da faixa glass, da hierarquia tipografica e dos campos em si

### 11.26 Glass suave restrito a coluna direita

Validado em `2026-07-12`:
- o pedido seguinte foi manter a composicao limpa, mas devolver um tratamento glass leve apenas na faixa direita
- a coluna institucional da esquerda nao deve receber esse efeito

Correcao aplicada:
- a coluna direita ganhou `glass` suave por gradiente translucido, `backdrop-blur` e brilho interno discreto
- os textos permaneceram com a mesma hierarquia e contraste para preservar legibilidade elegante
- a miniatura administrativa foi alinhada ao mesmo comportamento

### 11.29 Atualizacao de actions do GitHub para Node 24

Causa da mudanca em `2026-07-12`:
- `actions/checkout@v4` e `actions/setup-node@v4`, usados em `.github/workflows/deploy.yml`, ainda declaravam runtime `node20`
- o GitHub deprecou esse runtime; troca forcada para `node24` comeca em `16 jun 2026`, remocao definitiva de `node20` em `16 set 2026`

Validacao feita antes de aplicar:
- confirmado via `action.yml` real de cada action que `v5.0.0`/`v5.0.1` (`checkout`) e `v5.0.0` (`setup-node`) sao releases GA, nao pre-release
- changelog de `checkout` v5: unica mudanca e o runtime, sem impacto de input/comportamento
- changelog de `setup-node` v5: unico breaking change real e cache automatico condicionado ao campo `packageManager` no `package.json` — nem `worker/package.json` nem `frontend/package.json` tem esse campo, entao o comportamento local fica identico ao v4
- runner `ubuntu-latest` hospedado ja atende o requisito minimo (`v2.327.1+`) automaticamente, sem acao necessaria

Decisao de escopo:
- atualizado apenas para v5 (a versao minima que resolve o problema), nao para os majors mais recentes (`checkout@v7`, `setup-node@v6`) — mesmo criterio usado para manter o Wrangler travado em `@4` alinhado ao `4.104.0` ja validado, evitando absorver mudancas nao relacionadas

Arquivos alterados:
- `.github/workflows/deploy.yml` (5 ocorrencias: 3x `actions/checkout`, 2x `actions/setup-node`)

### 11.15 Deploy publicado desta rodada

Publicado em `2026-07-11`:
- migracao remota `0002_agent-avatars.sql` aplicada com sucesso
- migracao remota `0003_login-branding.sql` aplicada com sucesso
- worker publicado em `https://caredesk-worker.faugusto-thecoral.workers.dev`
- frontend publicado em `https://caredesk-lou.pages.dev`
- deployment URL do frontend desta rodada: `https://52b18ab1.caredesk-lou.pages.dev`

Checagem final:
- `GET /health` respondeu `200` com `{\"status\":\"ok\",\"app\":\"CareDesk\"}`
- `GET https://caredesk-lou.pages.dev/login` respondeu `200`

### 11.27 Imagem de fundo dedicada para a pagina de login

Escopo entregue em `2026-07-12`:
- nova chave `login_background_image_url`, que cobre o fundo da pagina de login inteira, atras do card de acesso com o efeito de borda pulsante
- e distinta de `login_image_url` (imagem institucional do painel esquerdo) — as duas sao independentes e podem ser configuradas separadamente
- reaproveita o nucleo de storage ja existente (`worker/src/utils/storage.js`) e o mesmo padrao de rotas genericas de upload/remocao de assets (`/api/settings/assets/:type`)
- novo namespace no R2: `branding/login-backgrounds/`
- preview da aba de identidade visual passou a aplicar essa imagem no fundo do card de preview inteiro, nao so no bloco institucional

Contrato consolidado:
- chave de configuracao: `login_background_image_url`
- chave interna de storage: `login_background_image_storage_key`

Arquivos principais desta entrega:
- `worker/migrations/0005_login-background.sql`
- `worker/src/db/schema.sql`
- `worker/src/routes/notifications.js` (`BRAND_ASSET_CONFIG`, whitelist de `PATCH /settings`, whitelist de `GET /settings/public`, pasta permitida em `sanitizeScopedAssetKey`)
- `frontend/src/theme/branding.js`
- `frontend/src/store/index.js`
- `frontend/src/components/admin/BrandingSettingsTab.jsx`
- `frontend/src/pages/Login.jsx`

Validacao local:
- `frontend`: `npm run build` ok em `2026-07-12` (bundle principal segue acima de `500 kB`, alerta ja conhecido do shader de login)
- `worker`: `npm test` ok em `2026-07-12` (6/6 testes de protocolo, sem regressao)
- `node --check` em `worker/src/routes/notifications.js` ok

Pendencia:
- a migration `0005_login-background.sql` ainda nao foi aplicada no D1 remoto — precisa rodar antes do proximo deploy oficial, junto com o restante do pacote de branding do login

### 11.28 Armadilha de ambiente: ACL quebrada entre Codex e Claude Code no Windows

Sintoma observado em `2026-07-12`:
- o Claude Code recebeu erro de permissao (`EPERM`/acesso negado) ao tentar editar `worker/migrations/`, `frontend/src/components/admin/BrandingSettingsTab.jsx` e `frontend/src/pages/Login.jsx`, mesmo com o resto do repositorio editavel normalmente

Causa raiz confirmada:
- Codex roda localmente sob uma identidade Windows sandbox propria (`DESKTOP-HUGKHAV\CodexSandboxOffline`) e por vezes usa permissao mais elevada para gravar em caminhos especificos
- em algum momento isso recriou esses 3 caminhos sem herdar a ACL corretamente, deixando-os sem a entrada de escrita do usuario interativo (`faugu`), usado pelo Claude Code
- verificado via `icacls`: a permissao de escrita compartilhada pelas duas ferramentas (grupo `DESKTOP-HUGKHAV\CodexSandboxUsers`, direito `Modify`) e uma entrada **explicita definida na raiz do repositorio** (`caredesk-sprint`), nao herdada de pastas acima — ou seja, qualquer correcao de ACL precisa ficar restrita a um caminho especifico dentro do repo, nunca resetar a partir da raiz do projeto, sob risco de apagar essa entrada e derrubar o acesso do Codex ao repositorio inteiro

Correcao aplicada:
- `takeown /F <caminho> /R /D Y` seguido de `icacls <caminho> /reset /T`, rodado apenas nos 3 caminhos especificos (nao na raiz do projeto), restaurando a heranca normal do diretorio pai imediato — que ja contem tanto `faugu:(F)` quanto `CodexSandboxUsers:(M,DC)`
- validado via `icacls` apos a correcao: os 3 caminhos voltaram a ter as duas identidades com acesso de escrita, nada foi perdido para o Codex

Regra pratica para o futuro:
- se qualquer ferramenta (Codex ou Claude Code) travar com erro de permissao num caminho especifico do projeto, comparar a ACL desse caminho com a de uma pasta irma via `icacls` antes de qualquer correcao
- nunca rodar `icacls /reset` na raiz do projeto (`caredesk-sprint`) — a permissao de escrita de ambas as ferramentas depende de uma entrada explicita definida exatamente ali
- corrigir sempre no nivel mais especifico possivel (a pasta ou arquivo com problema), nunca num ancestral maior do que o necessario

### 11.29 Layout-base compartilhado entre login publico e preview administrativa

Validado em `2026-07-12`:
- o repositório local estava limpo e alinhado com `origin/main`
- apesar disso, a tela publica de login e a miniatura da aba `Identidade Visual` ainda mantinham markup paralelo para a mesma composicao
- essa duplicacao explicava parte das regressões visuais recentes: uma tela era corrigida e a outra podia voltar a divergir

Correcao estrutural aplicada:
- criado `frontend/src/components/login/LoginCardLayout.jsx` como fonte unica do layout-base do card de login
- `frontend/src/pages/Login.jsx` passou a reutilizar esse layout compartilhado para a tela publica
- `frontend/src/components/admin/BrandingSettingsTab.jsx` passou a reutilizar o mesmo layout compartilhado em modo compacto para a previsualizacao

Regra consolidada:
- glow pulsante continua envolvendo o card principal inteiro
- glass suave continua restrito apenas a coluna direita
- imagem institucional da esquerda, tipografia e bloco inferior passam a nascer da mesma estrutura nas duas telas
- qualquer proximo refinamento da composicao do login deve acontecer primeiro no componente compartilhado, e nao em duas arvores JSX separadas

### 11.30 Workflow oficial agora detecta escopo de deploy

Consolidado em `2026-07-12`:
- o fluxo oficial ainda publicava worker e frontend em todo `push` para `main`, mesmo quando so uma metade do produto tinha mudado
- isso aumentava ruido no `Actions`, alongava publicacoes pequenas e mantinha uma diferenca desnecessaria entre o que mudou e o que era republicado

Correcao aplicada:
- `.github/workflows/deploy.yml` ganhou um job inicial de deteccao de escopo (`changes`)
- em `push`, o workflow agora compara os arquivos alterados e decide separadamente se precisa publicar `worker`, `frontend` ou ambos
- em `workflow_dispatch`, o operador agora escolhe `target = all | worker | frontend`
- o `run-name` manual ficou mais informativo e passou a aceitar um `reason`
- o job de frontend foi alinhado para `wrangler@4`, no mesmo patamar do fluxo manual local mais recente

Regra operacional consolidada:
- mudanca so em `frontend/` deve gerar deploy apenas do frontend
- mudanca so em `worker/` deve gerar deploy apenas do worker
- publicacao manual oficial pelo GitHub agora pode ser direcionada por alvo, sem republicar a outra metade do sistema sem necessidade
- deploy manual local continua existindo para contingencia, mas o trilho principal rastreavel fica mais fiel ao pacote real publicado

### 11.31 Geometria sincronizada da borda pulsante no login

Validado em `2026-07-12`:
- alguns cantos do glow do login pareciam arredondados e outros mostravam uma “ponta” visual
- a causa raiz nao estava nas cores nem no bloom, e sim na geometria desalinhada entre o shader e o card real

Causa raiz confirmada:
- `frontend/src/components/ui/LoginPulsingBorder.jsx` ainda usava valores fixos de raio (`32px` externo e `26px` interno)
- o login publico usava um card maior (`36px`) e a miniatura administrativa usava outro (`24px`)
- como o `inner wrapper` tambem mantinha um `rounded` proprio e fixo, o shader seguia uma silhueta e o card seguia outra

Correcao aplicada:
- `LoginPulsingBorder` agora recebe `radius` explicito
- o raio externo do shader e o clipping do wrapper passam a obedecer esse mesmo valor
- o raio interno passa a ser calculado a partir de `radius - inset - 1`, sincronizando a curvatura com a espessura visivel do efeito
- `frontend/src/pages/Login.jsx` passou a usar `radius={36}`
- `frontend/src/components/admin/BrandingSettingsTab.jsx` passou a usar `radius={24}`
- os wrappers filhos imediatos deixaram de reimpor um `rounded` concorrente e passaram a herdar a geometria correta

Resultado esperado:
- a borda pulsante passa a acompanhar melhor o formato real do card
- o login publico e a miniatura administrativa mantêm a mesma logica geométrica, mesmo com raios diferentes

Validacao:
- `frontend`: `npm run build` ok em `2026-07-12`

Refino adicional ainda em `2026-07-12`:
- depois da sincronizacao do `radius`, as quinas arredondadas melhoraram, mas ainda restavam pontas visuais em alguns presets
- a causa residual estava na `roundness` herdada do preset do shader, que podia continuar mais “reta” do que a silhueta real do card
- `LoginPulsingBorder` passou a impor um piso de `roundness` derivado do `radius`, preservando `circle` como caso extremo e evitando que presets mais retos deformem as quinas do glow
- `frontend`: `npm run build` ok novamente apos esse ajuste fino

Refino complementar ainda em `2026-07-12`:
- mesmo depois do ajuste de `roundness`, a ponta visual persistia mais no lado direito
- a causa residual final estava na propria coluna direita do layout: como ela usa `backdrop-blur`, depender apenas do clipping do pai nao era suficiente para arredondar visualmente o bloco
- `LoginPulsingBorder` passou a expor `--login-card-inner-radius` como variavel CSS
- `frontend/src/components/login/LoginCardLayout.jsx` passou a aplicar explicitamente esse raio nas quinas esquerdas e direitas das duas colunas
- `frontend`: `npm run build` ok novamente apos o ajuste

## 12. Plano de Acao Detalhado — Proximos Passos (analise de 2026-07-12)

Este bloco registra uma auditoria completa do estado do projeto em `2026-07-12`, com um passo a passo detalhado o suficiente para qualquer agente (Claude Code, Codex ou humano) executar cada item sem depender de contexto de conversa anterior. Cada item traz: objetivo, arquivos exatos, estado atual, mudanca proposta, passos concretos e criterio de validacao. Nenhum destes itens foi implementado ainda — este bloco e so o plano.

Prioridade geral recomendada: **Seguranca > Operacional/Deploy > Duplicacao de codigo > Performance > Testes > Roadmap de produto**. Dentro de cada bloco, os itens estao na ordem sugerida de execucao.

### 12.1 Seguranca

#### 12.1.1 — Corrigir IDOR em `PATCH /api/notifications/:id/read`

- **Objetivo:** impedir que um agente autenticado marque como lida a notificacao de outro agente.
- **Arquivo:** `worker/src/routes/notifications.js`
- **Estado atual:** a rota `notifications.patch('/:id/read', ...)` faz `UPDATE notifications SET is_read = 1 WHERE id = ?`, sem filtrar por `agent_id`. Qualquer agente autenticado pode chamar essa rota com o `id` de uma notificacao de outro agente e ela sera marcada como lida.
- **Mudanca proposta:** adicionar `AND agent_id = ?` ao `WHERE`, ligando o valor a `c.get('agent').sub` (mesmo padrao ja usado em `notifications.post('/read-all', ...)`, poucas linhas abaixo, que ja filtra por `agent_id = ?`).
- **Passos:**
  1. Abrir `worker/src/routes/notifications.js`, localizar `notifications.patch('/:id/read', ...)`.
  2. Trocar o SQL para `UPDATE notifications SET is_read = 1 WHERE id = ? AND agent_id = ?`.
  3. Adicionar `agent.sub` como segundo `.bind(...)`, obtendo `agent` via `const agent = c.get('agent')` no topo do handler.
  4. Opcional (recomendado): verificar `result.meta.changes` apos o `.run()` e retornar `404` se `changes === 0` (nenhuma notificacao daquele agente com aquele id foi encontrada).
- **Validacao:** login como agente A, tentar `PATCH /api/notifications/<id-de-notificacao-do-agente-B>/read` autenticado como A — deve falhar silenciosamente (nenhuma linha afetada) ou retornar 404, nunca 200 com sucesso real sobre a notificacao de B. Rodar `npm test` no worker (nao deve quebrar nada, esse arquivo nao tem teste dedicado hoje).

#### 12.1.2 — Reforcar rate limit de login (hoje so por IP)

- **Objetivo:** reduzir a chance de contornar o rate limit girando IP, sem penalizar demais usuarios atras do mesmo IP/NAT.
- **Arquivo:** `worker/src/routes/auth.js`, tabela `login_rate_limit` em `worker/src/db/schema.sql`.
- **Estado atual:** o rate limit de `POST /api/auth/login` usa como chave apenas o IP (`CF-Connecting-IP` ou fallback), com bloqueio apos 5 tentativas por 15 minutos.
- **Mudanca proposta:** adicionar uma segunda checagem de rate limit, com chave sendo o email normalizado (lowercase, trim) usado na tentativa de login, independente do IP. Bloquear a tentativa se **qualquer uma** das duas chaves (IP ou email) estiver com o limite atingido.
- **Passos:**
  1. Na tabela `login_rate_limit`, a `key` ja e um `TEXT PRIMARY KEY` generico — pode reusar a mesma tabela prefixando a chave (ex: `ip:1.2.3.4` vs `email:admin@caredesk.local`) para nao precisar de nova tabela/migration.
  2. Em `worker/src/routes/auth.js`, no handler de `POST /login`, antes de validar a senha: checar e incrementar tanto `ip:<ip>` quanto `email:<email_normalizado>` na tabela, com a mesma logica de bloqueio ja existente (5 tentativas / 15 min).
  3. Em caso de sucesso no login, limpar **ambas** as chaves (IP e email) associadas aquela tentativa, nao so a atual.
- **Validacao:** simular 5 tentativas erradas para o mesmo email vindas de IPs diferentes — a 6a deve ser bloqueada mesmo com IP novo. `npm test` no worker continua passando.

#### 12.1.3 — Tornar `verifyPassword` resistente a timing attack

- **Objetivo:** eliminar a comparacao insegura de hash de senha.
- **Arquivo:** `worker/src/routes/auth.js`, funcao `verifyPassword`.
- **Estado atual:** a comparacao final do hash calculado com o hash armazenado usa `.every(...)`, que sai do loop no primeiro byte diferente — vulneravel a timing attack em teoria (mitigado na pratica pelo custo do PBKDF2, mas nao e a pratica correta).
- **Mudanca proposta:** reusar o padrao `timingSafeEqual` ja implementado em `worker/src/middleware/auth.js` (usado hoje para comparar assinatura de JWT) para comparar os bytes do hash.
- **Passos:**
  1. Exportar `timingSafeEqual` de `worker/src/middleware/auth.js` (hoje pode ser funcao interna nao exportada — confirmar e ajustar o `export` se necessario).
  2. Importar essa funcao em `worker/src/routes/auth.js`.
  3. Trocar a comparacao `.every(...)` dentro de `verifyPassword` para usar `timingSafeEqual` sobre os arrays de bytes do hash calculado vs. armazenado.
- **Validacao:** login com senha correta continua funcionando; login com senha errada continua sendo rejeitado; `npm test` no worker passa.

#### 12.1.4 — Segunda camada de protecao em `POST /api/setup/admin`

- **Objetivo:** nao depender de uma unica variavel de ambiente (`APP_ENV`) para impedir recriacao do admin sem autenticacao em producao.
- **Arquivo:** `worker/src/routes/setup.js`, `worker/wrangler.toml` (secrets).
- **Estado atual:** a rota inteira e bloqueada com `if (c.env.APP_ENV === 'production') return 403`. Se essa variavel estiver ausente ou errada em algum ambiente, a rota fica aberta e permite recriar o admin com senha arbitraria, sem autenticacao.
- **Mudanca proposta:** exigir tambem um header com um segredo dedicado (ex: `X-Setup-Token`), comparado a uma nova secret `SETUP_TOKEN` do Worker. Sem o header correto, a rota falha mesmo que `APP_ENV` esteja mal configurado.
- **Passos:**
  1. Definir `SETUP_TOKEN` via `wrangler secret put SETUP_TOKEN` (worker) — nao versionar o valor.
  2. Em `worker/src/routes/setup.js`, alem do guard de `APP_ENV`, adicionar checagem: `if (c.req.header('X-Setup-Token') !== c.env.SETUP_TOKEN) return c.json({ error: 'Nao autorizado' }, 403)`.
  3. Atualizar `worker/scripts/create-admin.js` para enviar esse header (ler de uma env var local, ex: `SETUP_TOKEN`).
  4. Atualizar `.dev.vars.example` e `README.md` (secao de setup local) documentando a nova variavel.
- **Validacao:** `node scripts/create-admin.js ...` continua funcionando localmente com o token configurado; chamar a rota sem o header (mesmo com `APP_ENV` != production) deve falhar.

#### 12.1.5 — Decisao sobre `password_reset_tokens` e `RESEND_API_KEY` (feature orfa)

- **Objetivo:** eliminar a ambiguidade de uma tabela e uma credencial que existem no schema/env mas nao tem nenhuma rota funcional associada.
- **Arquivos:** `worker/src/db/schema.sql` (tabela `password_reset_tokens`), `worker/.dev.vars.example` (`RESEND_API_KEY`).
- **Estado atual:** a tabela existe desde o schema inicial, a credencial de email existe no `.dev.vars.example`, mas nenhuma rota emite ou valida token de reset — a unica forma de resetar senha hoje e um admin autenticado usar `POST /api/agents/:id/reset-password`.
- **Duas opcoes, escolher uma:**
  - **Opcao A — Implementar de vez:** criar `POST /api/auth/forgot-password` (recebe email, gera token, grava hash em `password_reset_tokens`, envia email via Resend usando `RESEND_API_KEY`) e `POST /api/auth/reset-password` (recebe token + nova senha, valida `expires_at`/`used`, atualiza `password_hash`, marca token como usado). Precisa de tela nova no frontend (`/esqueci-senha`, `/redefinir-senha/:token`).
  - **Opcao B — Remover:** apagar a tabela `password_reset_tokens` do `schema.sql` (+ migration `DROP TABLE`), remover `RESEND_API_KEY` do `.dev.vars.example`, documentar em `README.md` que reset de senha e feito exclusivamente por admin.
- **Recomendacao:** Opcao B no curto prazo (reduz superficie sem remover funcionalidade que ninguem usa), Opcao A se o produto realmente precisar de self-service de reset de senha no futuro.
- **Validacao:** se opcao B, `npm run db:init` local continua criando o schema sem erro, sem a tabela.

### 12.2 Operacional / Deploy

#### 12.2.1 — Alinhar versao do Wrangler no `worker/package.json`

- **Objetivo:** eliminar o aviso "The version of Wrangler you are using is now out-of-date" que aparece no job `Deploy Worker` do GitHub Actions, e alinhar com a versao ja validada manualmente (`4.104.0`) e usada no job `Deploy Frontend` (`wrangler@4`).
- **Arquivo:** `worker/package.json`
- **Estado atual:** `"devDependencies": { "wrangler": "^3.65.0" }` — o job `Deploy Worker` do CI roda `npx wrangler deploy` dentro de `worker/`, que resolve essa versao antiga via `npm ci`.
- **Mudanca proposta:** atualizar para `"wrangler": "^4.0.0"` (ou fixar em `4.104.0` se quiser reprodutibilidade exata).
- **Passos:**
  1. Editar `worker/package.json`, trocar a versao do `wrangler` em `devDependencies`.
  2. Rodar `npm install` dentro de `worker/` para atualizar `worker/package-lock.json`.
  3. Rodar `npx wrangler --version` dentro de `worker/` para confirmar que resolveu para 4.x.
  4. Testar localmente: `npm run dev` (sobe o worker local) e, se possivel, `npx wrangler deploy --dry-run` (ou um deploy real de teste) para garantir que nada quebrou com a major nova.
- **Validacao:** proximo run do GitHub Actions (`Deploy Worker`) nao deve mais mostrar o aviso de versao desatualizada nos logs.

#### 12.2.2 — Pinar versao do Wrangler nos scripts de deploy manual

- **Objetivo:** eliminar divergencia de versao entre deploy manual local e o pipeline do GitHub Actions.
- **Arquivos:** `scripts/deploy-worker.ps1`, `scripts/deploy-frontend.ps1`
- **Estado atual:** ambos chamam `npx wrangler deploy` / `npx wrangler pages deploy` sem versao pinada — resolve para o que estiver disponivel/instalado no ambiente local no momento.
- **Mudanca proposta:** trocar para `npx wrangler@4 deploy` / `npx wrangler@4 pages deploy ...` explicitamente em ambos os scripts, mesma major usada no CI.
- **Passos:**
  1. Editar as duas linhas de comando nos respectivos `.ps1`.
  2. Rodar `npm run deploy:manual:worker` e `npm run deploy:manual:frontend` uma vez cada para confirmar que ainda funcionam.
- **Validacao:** scripts continuam publicando com sucesso; `npx wrangler@4 --version` mostra a mesma major usada no Actions.

#### 12.2.3 — Runbook unico para aplicar todas as migrations

- **Objetivo:** evitar o que aconteceu durante a sessao de `2026-07-12` (D1 local desatualizado, faltando as migrations `0002` a `0006`, descoberto no meio de um teste).
- **Arquivos:** `worker/package.json` (scripts), `worker/migrations/*.sql`
- **Estado atual:** `db:init`/`db:init:remote`, `db:backfill`/`db:backfill:remote` e `db:cleanup`/`db:cleanup:remote` cobrem só `schema.sql`, `0000` e `0001`. As migrations `0002` a `0006` nao tem script npm — precisam de `wrangler d1 execute caredesk-sprint [--remote] --file=migrations/000X_nome.sql` manual, uma por uma, na ordem certa.
- **Mudanca proposta:** criar um script (`worker/scripts/run-migrations.js` ou similar) que:
  1. Le todos os arquivos em `worker/migrations/*.sql`, ordenados pelo prefixo numerico.
  2. Aplica cada um via `wrangler d1 execute caredesk-sprint --file=<arquivo>` (local) ou `--remote` (remoto), na ordem.
  3. Registra localmente (ex: em um arquivo `worker/migrations/.applied` ou tabela `_migrations` no proprio D1) quais ja foram aplicadas, para nao reaplicar (as migrations usam `INSERT OR IGNORE`/recreate-table, entao reaplicar nao quebra dados, mas evita trabalho/tempo desnecessario).
  4. Adicionar `worker/package.json`: `"db:migrate": "node scripts/run-migrations.js"` e `"db:migrate:remote": "node scripts/run-migrations.js --remote"`.
- **Validacao:** rodar `npm run db:migrate` num D1 local vazio (só com `schema.sql` aplicado) deve deixar o schema identico ao de um D1 que rodou `schema.sql` + todas as migrations manualmente uma a uma.

#### 12.2.4 — Documentar a fricção recorrente de ACL entre Codex e Claude Code

- **Objetivo:** nao perder tempo re-diagnosticando o mesmo problema a cada nova pasta/arquivo afetado.
- **Estado atual:** já documentado em `README.md` (secao "Ambiente local com multiplas ferramentas de IA") e `Status.md` (`11.28`), mas o problema se repetiu em pelo menos 4 caminhos diferentes numa unica sessao (`worker/migrations/`, `frontend/src/components/admin/BrandingSettingsTab.jsx`, `frontend/src/pages/Login.jsx`, `.github/workflows/deploy.yml`).
- **Acao recomendada:** nenhuma mudanca de codigo — so manter o procedimento ja documentado (`takeown /F <caminho> /R /D Y` + `icacls <caminho> /reset /T`, nunca na raiz do projeto) como resposta padrao sempre que uma das ferramentas travar com erro de permissao num caminho especifico. Nao vale tentar "resolver de vez" via reset na raiz — ja identificado como arriscado (apagaria a entrada `CodexSandboxUsers` que vive explicitamente ali).

### 12.3 Duplicacao de codigo (risco de bug silencioso)

#### 12.3.1 — Extrair logica de contato compartilhada entre `PatientDetail.jsx` e `PatientPanel.jsx`

- **Objetivo:** parar de precisar editar dois arquivos toda vez que uma regra de exibicao de contato mudar (aconteceu ao adicionar WhatsApp/Email nesta sessao).
- **Arquivos afetados:** `frontend/src/pages/PatientDetail.jsx`, `frontend/src/components/PatientPanel.jsx`
- **Estado atual:** os dois arquivos definem separadamente: `typeConfig` (icone + cor por `contact_type`), `typeLabel`/`label` por tipo, `outcomeConfig`, `urgencyBadge`, `statusLabel`, `getInitials`. Sao objetos praticamente identicos, mantidos por copy-paste.
- **Mudanca proposta:** criar `frontend/src/utils/contactDisplay.js` exportando `CONTACT_TYPE_CONFIG` (icone, cor, label por tipo — hoje `call`, `whatsapp`, `email`, `in_person`), `OUTCOME_CONFIG`, `URGENCY_BADGE`, `STATUS_LABEL` e `getInitials(name)`. Importar esses exports nos dois arquivos, removendo as copias locais.
- **Passos:**
  1. Criar o novo arquivo `frontend/src/utils/contactDisplay.js` com os objetos consolidados (usar a versao de `PatientDetail.jsx` como base, ja que é a mais completa/atual).
  2. Em `PatientDetail.jsx`: remover as definicoes locais de `CONTACT_TYPES` (adaptar para gerar a partir do novo `CONTACT_TYPE_CONFIG`), `typeConfig`, `typeLabel`, `outcomeConfig` dentro de `LogItem`, `urgencyBadge`, `statusLabel`, `getInitials` — importar do novo util.
  3. Em `PatientPanel.jsx`: mesma limpeza — importar `typeConfig`, `outcomeConfig`, `urgencyBadge`, `statusLabel`, `getInitials` do novo util.
  4. Build (`npm run build`) e checagem visual das duas telas (detalhe completo do paciente e o painel lateral via `Patients.jsx`) para confirmar que nada mudou visualmente.
- **Validacao:** `npm run build` sem erro; abrir um paciente com contatos de tipos variados (`call`, `whatsapp`, `email`, `in_person`) tanto na pagina completa quanto no painel lateral e conferir que icones/labels aparecem identicos a antes da refatoracao.

#### 12.3.2 — Consolidar helpers de mistura de cor entre `visualThemes.js` e `darkPalette.js`

- **Objetivo:** evitar que um ajuste no algoritmo de mistura de cor seja feito num arquivo e esquecido no outro.
- **Arquivos:** `frontend/src/theme/visualThemes.js`, `frontend/src/theme/darkPalette.js`
- **Estado atual:** as duas funcoes `mix`, `normalizeHex`, `hexToRgb`, `rgbToHex`, `hexToRgbTriplet` existem duplicadas (implementacao identica) nos dois arquivos.
- **Mudanca proposta:** criar `frontend/src/theme/colorUtils.js` com essas 5 funcoes exportadas; importar em ambos `visualThemes.js` e `darkPalette.js`, removendo as copias locais.
- **Passos:**
  1. Criar `frontend/src/theme/colorUtils.js` movendo as 5 funcoes pra la (exportadas).
  2. Atualizar `visualThemes.js` e `darkPalette.js` pra importar dessas funcoes em vez de defini-las localmente.
  3. `npm run build` e conferir visualmente que a troca de tema (claro/escuro, e os 5 temas predefinidos no admin) continua identica.
- **Validacao:** build sem erro; trocar entre os 5 temas visuais no admin e alternar dark/light — cores devem ficar identicas ao comportamento anterior.

#### 12.3.3 — Unificar defaults de branding entre `useSettingsStore` e `BrandingSettingsTab`

- **Objetivo:** ter uma unica fonte de verdade pros valores default de branding.
- **Arquivos:** `frontend/src/store/index.js` (objeto `settings` default de `useSettingsStore`), `frontend/src/components/admin/BrandingSettingsTab.jsx` (`getDefaultFormState()`)
- **Estado atual:** os dois objetos tem os mesmos ~20 campos com os mesmos valores default, mantidos separadamente.
- **Mudanca proposta:** exportar uma constante `DEFAULT_BRANDING_SETTINGS` (provavelmente de `frontend/src/theme/branding.js`, que ja concentra a logica de branding) e usar essa mesma constante tanto no `useSettingsStore` quanto em `getDefaultFormState()`.
- **Passos:**
  1. Em `frontend/src/theme/branding.js`, exportar `DEFAULT_BRANDING_SETTINGS` com todos os campos e valores default hoje espalhados nos dois arquivos.
  2. Em `frontend/src/store/index.js`, trocar o objeto `settings` inicial para spread desse default (`{ ...DEFAULT_BRANDING_SETTINGS }`).
  3. Em `BrandingSettingsTab.jsx`, trocar `getDefaultFormState()` para retornar `{ ...DEFAULT_BRANDING_SETTINGS }`.
- **Validacao:** `npm run build`; abrir o admin com um `app_settings` vazio/novo (D1 local recem-criado) e confirmar que os campos aparecem com os mesmos defaults de antes.

#### 12.3.4 — Remover dependencia morta `jose` do worker

- **Arquivo:** `worker/package.json`
- **Estado atual:** `jose` está listada em `dependencies` mas nunca é importada em nenhum arquivo de `worker/src` — o JWT é implementado manualmente em `worker/src/middleware/auth.js` via Web Crypto.
- **Passos:** remover a linha `"jose": "^5.6.3"` de `worker/package.json`, rodar `npm install` em `worker/` pra atualizar o lockfile.
- **Validacao:** `npm test` e `npm run dev` no worker continuam funcionando normalmente (confirma que realmente nao era usada).

#### 12.3.5 — Remover funcao morta `SettingsTab()` de `Admin.jsx`

- **Arquivo:** `frontend/src/pages/Admin.jsx`
- **Estado atual:** existe uma funcao `SettingsTab()` (por volta da linha 722) que implementa uma versao antiga/simplificada de configuracoes gerais, mas nunca e referenciada no componente `Admin()` — a aba "Identidade Visual" usa `BrandingSettingsTab` (componente importado separado).
- **Passos:**
  1. Confirmar via busca (`grep -n "SettingsTab" frontend/src/pages/Admin.jsx`) que a unica ocorrencia e a propria definicao (nenhum uso).
  2. Remover a funcao inteira.
  3. Remover imports que só eram usados por ela, se sobrarem sem uso (checar `useSettingsStore`, `VISUAL_THEMES` — confirmar se ainda sao usados em outra parte do arquivo antes de remover o import).
- **Validacao:** `npm run build` sem erro (confirma que nada mais dependia dessa funcao).

#### 12.3.6 — Decidir sobre os tokens `colors.urgency.*` nao usados no Tailwind

- **Arquivo:** `frontend/tailwind.config.js`
- **Estado atual:** existe um grupo `colors.urgency` (`ok`/`soon`/`due`/`overdue`) com valores hex fixos, mas `Patients.jsx`, `Dashboard.jsx` e `PatientDetail.jsx` reimplementam as mesmas cores de urgencia inline (`bg-[#fff8e1]` etc.) em vez de usar `bg-urgency-*`/`text-urgency-*`.
- **Duas opcoes:**
  - **Opcao A:** adotar os tokens de verdade — trocar as cores inline dos 3 arquivos pelas classes `urgency-*` do Tailwind, garantindo que os hex batam com os ja usados hoje (comparar valor por valor antes de trocar, pra nao mudar a aparencia).
  - **Opcao B:** remover o grupo `colors.urgency` do `tailwind.config.js`, ja que nunca foi adotado.
- **Recomendacao:** Opcao A se o objetivo e consistencia visual de longo prazo (facilita trocar a paleta de urgencia num lugar so no futuro); Opcao B se o objetivo e so reduzir superficie de configuracao morta agora.
- **Validacao:** captura de tela antes/depois das 3 telas (Patients, Dashboard, PatientDetail) pra confirmar que as cores de urgencia continuam identicas visualmente.

### 12.4 Performance

#### 12.4.1 — Lazy-load do shader `@paper-design/shaders-react`

- **Objetivo:** tirar o bundle principal de cima dos `500 kB` (aviso presente em todo build do frontend desde que o shader foi adotado).
- **Arquivos:** `frontend/src/components/ui/LoginPulsingBorder.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/components/admin/BrandingSettingsTab.jsx`
- **Estado atual:** `LoginPulsingBorder.jsx` importa `{ PulsingBorder, pulsingBorderPresets }` de `@paper-design/shaders-react` de forma estatica no topo do arquivo — isso inclui a lib inteira no bundle principal (`index-*.js`), mesmo em paginas que nao renderizam o componente.
- **Mudanca proposta:** trocar para import dinamico via `React.lazy`, carregando o shader só quando o componente `LoginPulsingBorder` realmente monta (tela de login e preview do admin).
- **Passos:**
  1. Criar um componente interno `LoginPulsingBorderInner` (ou renomear o conteudo atual) que faz o `import` estatico de `@paper-design/shaders-react` como hoje.
  2. No arquivo `LoginPulsingBorder.jsx` exportado publicamente, envolver esse componente interno com `React.lazy(() => import('./LoginPulsingBorderInner'))`.
  3. Envolver o uso desse lazy component com `<Suspense fallback={...}>` — o fallback pode ser simplesmente `children` sem o efeito (ja que o proprio componente ja trata `isEnabled=false` como fallback pra borda estatica), ou `null`.
  4. Como `Login.jsx` e `BrandingSettingsTab.jsx` já importam `LoginPulsingBorder` normalmente, nenhuma mudanca é necessária nesses dois arquivos além de garantir que o `Suspense` esteja no lugar certo (dentro do proprio `LoginPulsingBorder.jsx` é o mais simples, sem precisar tocar nos consumidores).
- **Validacao:** `npm run build` — o bundle principal deve cair visivelmente abaixo de `500 kB`; a lib do shader deve aparecer como um chunk separado carregado sob demanda. Testar visualmente a tela de login e o preview do admin pra garantir que a borda pulsante ainda aparece (so que com um pequeno delay no primeiro carregamento, que é o comportamento esperado de lazy loading).

#### 12.4.2 — Quebrar `PatientDetail.jsx` e `Admin.jsx` em componentes menores

- **Objetivo:** reduzir o tamanho dos dois maiores arquivos do frontend (995 e 885 linhas respectivamente em `2026-07-12`), facilitando manutencao e reduzindo o risco descrito em `12.3.1`.
- **`frontend/src/pages/PatientDetail.jsx` — quebra sugerida:**
  - Extrair o modal "Registrar Contato" (incluindo o builder de protocolo customizado inline) para `frontend/src/components/patient/RegisterContactModal.jsx`.
  - Extrair o modal "Editar Paciente" para `frontend/src/components/patient/EditPatientModal.jsx`.
  - Extrair `LogItem` para `frontend/src/components/patient/ContactLogItem.jsx` (e reusar em `PatientPanel.jsx` tambem, complementando o item `12.3.1`).
- **`frontend/src/pages/Admin.jsx` — quebra sugerida:**
  - Extrair `ProtocolTab` (+ `ProtocolModal`, `DayChip`) para `frontend/src/components/admin/ProtocolTab.jsx`.
  - Extrair `AgentsTab` (+ `AgentModal`, `ResetPasswordModal`) para `frontend/src/components/admin/AgentsTab.jsx`.
  - Isso alem de reduzir o tamanho do arquivo, torna a remocao do `SettingsTab()` morto (item `12.3.5`) mais segura de revisar isoladamente.
- **Validacao:** `npm run build` sem erro; percorrer manualmente os fluxos de registrar contato, editar paciente, criar/editar protocolo e criar/editar agente, conferindo que nada mudou de comportamento.

### 12.5 Testes automatizados

#### 12.5.1 — Configurar Vitest no frontend

- **Objetivo:** sair de zero cobertura de teste no frontend.
- **Passos:**
  1. `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom` em `frontend/`.
  2. Configurar `test` em `frontend/vite.config.js` (ambiente `jsdom`) e adicionar script `"test": "vitest run"` em `frontend/package.json`.
  3. Primeiro alvo de teste: `frontend/src/utils/protocols.js` (espelha `worker/src/utils/protocols.js`, que ja tem testes no backend — usar os mesmos casos de `worker/test/protocols.test.js` como referencia, adaptando pra `buildProtocolTimeline`/`getNextFollowup`/etc.).
  4. Segundo alvo: `frontend/src/theme/branding.js` (`sanitizeBrandUrl`, `sanitizePrimaryColor`, `sanitizeColorString` — funcoes puras, faceis de testar, e criticas para seguranca/XSS).
- **Validacao:** `npm test` roda e passa no CI (considerar adicionar como step no `deploy-frontend` job do workflow, antes do build).

#### 12.5.2 — Expandir testes do worker alem de `utils/protocols.js`

- **Objetivo:** cobrir a logica de negocio critica que hoje depende so de teste manual.
- **Alvos sugeridos, em ordem de prioridade:**
  1. `worker/src/utils/storage.js` — `sanitizeScopedAssetKey` (camada de seguranca contra path traversal, testavel sem precisar de R2 real), `isSupportedImageAssetType`, `extensionForMimeType`.
  2. `worker/src/middleware/auth.js` — `signToken`/`verifyToken` (gerar token, verificar, testar expiracao e assinatura invalida).
  3. `worker/src/routes/auth.js` — `hashPassword`/`verifyPassword` (incluindo o caso especial do `$PLACEHOLDER_HASH$`).
- **Validacao:** `npm test` no worker continua rodando via `node --test`, sem precisar de framework novo.

#### 12.5.3 — Formalizar os scripts de verificacao visual (Playwright) usados nesta sessao

- **Objetivo:** nao reinventar o driver de teste visual a cada sessao — nesta mesma sessao, scripts Playwright ad-hoc foram criados no scratchpad (fora do repositorio) pra validar upload de imagens, layout da aba de identidade visual e o seletor de tipos de contato, e depois descartados.
- **Mudanca proposta:** criar uma skill de projeto (`.claude/skills/run/SKILL.md` ou equivalente) documentando como subir `worker` + `frontend` localmente e dirigir via Playwright, com os comandos exatos ja validados nesta sessao (login com `admin`/`CareDesk2026!`, portas `5173`/`8787`, etc.), para que a proxima sessao nao precise redescobrir isso.
- **Validacao:** proxima vez que uma mudanca visual precisar de verificacao, o fluxo deve ser "invocar a skill" em vez de escrever um script novo do zero.

### 12.6 Roadmap de produto (nao e divida tecnica — e evolucao planejada)

#### 12.6.1 — `avatars/patients` (imagem de perfil do paciente)

- Proximo passo natural depois de `avatars/agents` (ja entregue), seguindo a ordem ja definida na secao "Ordem recomendada de implementacao" do `README.md`.
- Reusar o mesmo nucleo de storage (`worker/src/utils/storage.js`, `BRAND_ASSET_CONFIG`-like pattern) e o mesmo padrao de rotas (`POST/DELETE /api/patients/:id/avatar`, espelhando `worker/src/routes/agents.js`).
- Precisa de migration nova (`avatar_url`, `avatar_storage_key` em `patients`) e de UI no cadastro/detalhe do paciente.

#### 12.6.2 — `attachments/patients` (anexos clinicos)

- So depois de `avatars/patients`, por decisao ja registrada no `README.md`.
- Precisa de tabela nova (não cabe em 2 colunas simples como avatar — são N anexos por paciente), com os campos descritos na secao "Metadados que devem ficar no D1" do `README.md` (`owner_type`, `owner_id`, `storage_key`, `mime_type`, `file_size`, `category`, `uploaded_by`, etc.).

#### 12.6.3 — Decidir sobre `patients.protocol_days` (coluna legada)

- **Estado atual:** a coluna ainda existe em `patients` e é o ultimo nivel de fallback (`LEGACY`) na cadeia de resolucao de protocolo (`worker/src/utils/protocols.js`), atras de `LINKED` → `DEFAULT` → `GLOBAL`.
- **Passos para avaliar remocao:**
  1. Rodar uma query no D1 remoto: `SELECT COUNT(*) FROM patients WHERE protocol_id IS NULL` — se o resultado for `0`, nenhum paciente depende mais do fallback legado (todos tem `protocol_id` valido).
  2. Se confirmado, criar migration pra remover a coluna `protocol_days` de `patients` (padrao recreate-table, como as migrations `0001`/`0006`).
  3. Remover o branch `LEGACY` de `worker/src/utils/protocols.js` e do teste correspondente em `worker/test/protocols.test.js`.
- **Risco de nao fazer:** nenhum — é so divida tecnica de uma coluna nao usada. Nao é urgente, mas fecha de vez a consolidacao de protocolos ja mencionada como pendente em varias secoes anteriores deste documento.

### 11.32 Borda CSS duplicada no card de login

Sintoma reportado em `2026-07-13`:
- mesmo apos as correcoes de geometria da secao `11.31`, ainda aparecia uma "ponta" visual em cantos do card de login, mais visivel em screenshots com zoom

Causa raiz identificada:
- havia duas bordas CSS de 1px aplicadas em raios praticamente identicos, em elementos DOM separados: uma no wrapper interno do `LoginPulsingBorder.jsx` (`border-outline-variant/60`, sempre presente, serve de fallback estatico quando o efeito esta desativado) e outra redundante no `<div>` filho imediato, tanto em `Login.jsx` quanto no preview de `BrandingSettingsTab.jsx`
- duas linhas finas sobrepostas, renderizadas por elementos distintos com anti-aliasing independente, sao um padrao classico para gerar esse tipo de costura visual nos cantos, especialmente sensivel em cantos arredondados

Correcao aplicada:
- removida a borda redundante do `<div>` interno em `frontend/src/pages/Login.jsx` (linha do card principal) e em `frontend/src/components/admin/BrandingSettingsTab.jsx` (preview da aba Identidade Visual)
- a borda estatica de fallback do `LoginPulsingBorder.jsx` foi mantida intacta e continua aparecendo corretamente quando o efeito esta desativado (validado visualmente)

Validacao:
- `frontend`: `npm run build` ok em `2026-07-13`
- testado com o efeito de borda pulsante desativado (`login_border_effect_enabled: false`) — contorno unico, limpo, sem regressao
- nao foi possivel reproduzir a "ponta" de forma 100% consistente em capturas automatizadas (o rendering de WebGL em Chromium headless pode diferir do navegador real), mas a duplicacao de borda encontrada e um problema real e objetivamente redundante, independente de ser ou nao a causa unica do sintoma reportado

### 11.33 `fetch-depth: 2` insuficiente no job de deteccao de escopo

Sintoma em `2026-07-13`:
- push com 3 commits de uma vez fez o job `Detect Deploy Scope` falhar com `fatal: bad object <sha>` ao tentar `git diff` contra o `before` do evento de push

Causa raiz:
- o step de checkout desse job usava `fetch-depth: 2`, suficiente apenas quando o push traz exatamente 1 commit novo
- quando um push agrupa varios commits, o `github.event.before` pode apontar para um commit mais antigo que o clone raso buscou, e o `git diff` falha por nao ter esse objeto localmente

Correcao aplicada:
- `fetch-depth: 2` trocado para `fetch-depth: 0` (historico completo) no checkout desse job especifico, unico lugar do workflow que faz `git diff` contra um commit arbitrario
- os demais jobs (`deploy-worker`, `deploy-frontend`) continuam com checkout raso padrao, que nao precisa de historico completo

Validacao:
- proximo push deve concluir o job `Detect Deploy Scope` mesmo agrupando multiplos commits

### 11.34 Remocao do selo "Acesso institucional" do login

Solicitado em `2026-07-13`:
- remover o texto `Acesso institucional` da coluna esquerda do card de login

Correcao aplicada:
- o texto foi removido diretamente de `frontend/src/components/login/LoginCardLayout.jsx`, fonte unica da composicao do login
- com isso, a mudanca vale ao mesmo tempo para a tela publica e para a miniatura da aba `Identidade Visual`

Resultado esperado:
- composicao mais limpa na coluna institucional
- a hierarquia visual passa a iniciar diretamente em `heroTitle` e `heroSubtitle`

Validacao:
- `frontend`: `npm run build` ok em `2026-07-13`

### 11.36 Hardening de seguranca (auditoria via mapa de aprendizados de seguranca)

Aplicado em `2026-07-13`, a partir da leitura da nota externa "Seguranca em apps web locais" (vault Obsidian do usuario), cruzada com o codigo atual do projeto.

Correcoes aplicadas (baixo risco, sem mudanca de schema):
- **IDOR em `PATCH /api/notifications/:id/read`** (`worker/src/routes/notifications.js`): agora filtra por `agent_id` do token, alem do `id`; retorna `404` se nenhuma linha do proprio agente for afetada. Antes, qualquer agente autenticado podia marcar como lida a notificacao de outro.
- **Timing leak no login** (`worker/src/routes/auth.js`): `verifyPassword` agora roda o PBKDF2 completo mesmo quando o email nao existe (usa um hash dummy fixo), e a comparacao final passou a ser byte a byte em tempo constante (`timingSafeEqualBytes`) em vez de `.every()` com early-exit.
- **Rate limit de login por IP + email** (`worker/src/routes/auth.js`): alem da chave por IP, agora existe uma chave por email normalizado na mesma tabela `login_rate_limit` (prefixos `ip:`/`email:`); bloqueia se qualquer uma das duas estourar. Nao precisou de migration — a tabela ja era chave-valor generica.
- **Segunda camada em `POST /api/setup/admin`** (`worker/src/routes/setup.js`): se a secret `SETUP_TOKEN` estiver configurada no Worker, exige o header `X-Setup-Token` alem do guard de `APP_ENV`. Opcional por design — sem a secret configurada, comportamento local continua identico ao anterior (nao quebra ambientes existentes). `worker/scripts/create-admin.js` atualizado para enviar o header quando `SETUP_TOKEN` estiver no ambiente local.
- **Security headers na API** (`worker/src/index.js`): middleware `secureHeaders` do Hono adicionado — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy`, HSTS, etc. `Cross-Origin-Resource-Policy` explicitamente setado para `cross-origin` (nao o default `same-origin`), porque a API e consumida de um dominio diferente (Pages) e serve as imagens de branding/avatar via `<img src>` — `same-origin` quebraria essas imagens.
- **CSP e headers no frontend** (`frontend/public/_headers`, convencao nativa do Cloudflare Pages): `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. `style-src` inclui `'unsafe-inline'` porque o app usa `style={{...}}` inline extensivamente (branding dinamico); `img-src` inclui `https:` amplo porque o admin pode configurar URLs de imagem arbitrarias; `connect-src` lista o worker de producao e `localhost:8787`.
- **`npm audit --audit-level=high` no CI** (`.github/workflows/deploy.yml`): adicionado nos dois jobs de deploy, com `|| true` — nao bloqueante, so visibilidade por enquanto.

Validacao feita antes de aplicar (sem tocar producao):
- `worker`: `npm test` ok (6/6), login local com senha certa/errada continua funcionando, rate limit e IDOR testados manualmente com sucesso
- `frontend`: `npm run build` ok
- CSP validada com um servidor estatico local simulando os headers do Cloudflare Pages + worker local: paginas `/login` e `/admin` (com o shader WebGL da borda pulsante ativo) carregaram sem nenhuma violacao de CSP no console — o unico erro observado foi CORS bloqueando uma origem de teste nao whitelisted, comportamento esperado e correto
- deploy real para uma branch de preview foi bloqueado pelo classificador de seguranca do Claude Code (deploy de producao sem aprovacao explicita do usuario) — respeitado, validacao feita 100% local

Item que ficou fora desta rodada por decisao deliberada (nao por pendencia):
- migracao do token JWT de `localStorage` para cookie `HttpOnly` — nao aplicada porque frontend e worker vivem em dominios diferentes (`pages.dev` e `workers.dev`), o que exigiria `SameSite=None` + `Secure` e mudanca de arquitetura de sessao; risco de quebra maior que o beneficio imediato dado que o CSP ja reduz boa parte do vetor de XSS que tornaria isso critico. Registrado como recomendacao futura, condicionada a migrar frontend+worker para um dominio unico primeiro.

### 11.37 Remocao de `password_reset_tokens` + bloco operacional/deploy + bundle do login

Aplicado em `2026-07-13`, continuando o plano de acao (secao 12) com foco em seguranca, saude do banco e fluidez, nessa ordem.

**Tabela orfa removida (`12.1.5`, decisao tomada: remover):**
- confirmado por busca em todo o codigo: `password_reset_tokens` e `RESEND_API_KEY` nunca tiveram rota funcional associada
- migration `0007_remove-password-reset-tokens.sql` (`DROP TABLE IF EXISTS`), `schema.sql` atualizado, `RESEND_API_KEY` removido de `.dev.vars.example`
- checado o total de linhas no D1 remoto antes de dropar (`0`) — zero risco de perda de dado
- aplicado local e remoto, `npm test` ok nos dois

**Wrangler alinhado (`12.2.1`):**
- `worker/package.json`: `wrangler` `^3.65.0` → `^4.0.0` (resolveu `4.110.0`, mesma linha ja validada no `Deploy Frontend` do CI)
- aproveitado para remover tambem a dependencia morta `jose` (nunca importada, JWT e feito a mao em `middleware/auth.js`)
- `npm install` sem vulnerabilidades, `npx wrangler dev --local` testado e funcionando normalmente sob a major nova

**Scripts de deploy manual pinados (`12.2.2`):**
- `scripts/deploy-worker.ps1` nao precisou de mudanca — `npx wrangler deploy` dentro de `worker/` ja resolve a versao 4.x local pelo `package.json`/lockfile, que agora e a fonte de verdade
- `scripts/deploy-frontend.ps1`: `npx wrangler pages deploy` → `npx wrangler@4 pages deploy`, porque `frontend/` nao tem `wrangler` como dependencia local (so instalado globalmente no CI) e ficaria sem nenhuma ancora de versao

**Runbook unico de migrations (`12.2.3`) — com um incidente real no meio do caminho:**
- criado `worker/scripts/run-migrations.js` (+ `npm run db:migrate` / `db:migrate:remote`): le `migrations/*.sql` em ordem, rastreia o que ja foi aplicado numa tabela `_migrations` no proprio D1, pula o que ja esta em dia
- modo `--bootstrap`: marca migrations existentes como aplicadas sem rodar o SQL, para nao reaplicar `ALTER TABLE` nao-idempotente contra um banco que ja tinha o schema em dia (aplicado manualmente ao longo da sessao, antes deste script existir)
- **primeira tentativa quebrou duas vezes por causa do path do projeto ter espaco** (`Developer CODEX`): `execFileSync` sem shell nao achava `npx` no Windows; com `shell:true` e array de args, o Node (versao atual) nao escapa os argumentos automaticamente (`DEP0190`), entao o path com espaco virava dois argumentos separados e o wrangler recusava. Resolvido trocando para `execSync` com uma string de comando montada manualmente, cada argumento entre aspas quando necessario
- **incidente real durante o teste no remoto:** a leitura da tabela `_migrations` (via `--file` com `--json`) veio contaminada por um aviso do proprio wrangler no stdout, quebrando o `JSON.parse`; o `catch` silencioso tratava isso como "nada aplicado" e o script comecou a reaplicar `0000` e `0001` de verdade contra producao antes de travar em `0002` com erro de coluna duplicada (esperado, e serviu de alarme)
  - **verificado que nao houve perda de dado**: `0000`/`0001` sao idempotentes por design (recreate-table/backfill condicional), a propria Cloudflare garante rollback automatico em caso de falha no meio de um `--file`, e a contagem de `patients`/`agents`/`followups`/`notifications`/`protocols`/`settings` foi conferida igual antes e depois; `/health` e login testados em producao logo em seguida, tudo normal
  - **causa raiz corrigida**: leitura de tracking trocada de `--file` para `--command` (sem o aviso de upload assincrono que contaminava o stdout), e o `catch` de parsing deixou de assumir silenciosamente "nada aplicado" — agora aborta alto e claro se nao conseguir confirmar o estado com seguranca, em vez de arriscar reaplicar migration contra dado real
  - reconfirmado local e remoto depois do fix: as 8 migrations aparecem como "ja aplicada, pulando" nos dois ambientes

**Bundle do login (`12.4.1`):**
- `@paper-design/shaders-react` isolado em `frontend/src/components/ui/LoginPulsingBorderShader.jsx`, carregado via `React.lazy` + `Suspense` a partir de `LoginPulsingBorder.jsx`, que perdeu o import estatico da lib
- bundle principal caiu de `536.22 kB` para `483.07 kB` — aviso de chunk `>500 kB` desapareceu por completo; o shader vira um chunk proprio de `55.68 kB`, buscado so quando o efeito esta ativo
- `manualChunks` (sugerido pela nota de aprendizados) avaliado e descartado por ora: o projeto so tem essa unica dependencia pesada, ja isolada pelo lazy load — adicionar mais grupos de chunk sem outro problema real seria otimizacao prematura
- validado com `vite preview` (build de producao de verdade, nao o dev server) + Playwright: o chunk do shader aparece como request de rede separado, a borda pulsante renderiza normalmente na tela de login publicada, sem erro de console

Validacao final desta rodada:
- `worker`: `npm test` ok (6/6)
- `frontend`: `npm run build` ok, sem aviso de chunk grande
- producao: `/health` `200`, login funcionando, contagem de registros confirmada igual antes/depois do incidente de migration

**Efeito colateral pego no proprio deploy do GitHub Actions:** o job `Deploy Worker` falhou logo apos o push — `wrangler` `4.110.0` exige Node.js `22+`, e o workflow ainda usava `node-version: 20` nos dois jobs de deploy. Corrigido para `22` em `deploy-worker` e `deploy-frontend` no mesmo `.github/workflows/deploy.yml`. Consequencia direta de resolver `^4.0.0` para a ultima 4.x disponivel; nao afeta ambiente local (ja em Node 24 nas maquinas usadas nesta sessao).
