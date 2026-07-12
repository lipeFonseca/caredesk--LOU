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
- tela administrativa para listar, criar, editar e excluir protocolos
- protocolo padrao
- protocolo customizado por paciente
- dias negativos, dia zero e dias positivos

Atualizacao local mais recente:
- o backend centraliza a resolucao de protocolo em uma unica regra
- ordem oficial local: protocolo vinculado -> protocolo padrao -> `app_settings.contact_protocol_days` -> legado `patients.protocol_days` apenas como compatibilidade final
- scheduler e rotas de pacientes compartilham a mesma logica de resolucao

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
