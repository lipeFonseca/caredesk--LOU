# CareDesk

Sistema interno de acompanhamento pos-operatorio para clinica, focado nesta fase em cadastro, protocolo, notificacoes internas e registro manual de contatos.

## Coracao do projeto

Estado atual:
- frontend em `frontend/` com React 18 + Vite + Tailwind + Framer Motion
- backend em `worker/` com Cloudflare Workers + Hono
- banco em Cloudflare D1
- autenticacao com JWT + PBKDF2
- scheduler diario para notificacoes internas de follow-up

Direcao atual do produto:
- acompanhamento operacional por painel interno
- protocolo de contato como regra central
- ligacao como principal acao operacional externa
- modulo de mensagens pausado por decisao de produto
- boot autenticado do frontend agora espera as configuracoes remotas antes do primeiro paint principal, evitando flash de branding antigo
- tela publica de login agora tambem consome branding remoto sanitizado antes do acesso, sem depender de sessao autenticada
- ambiente publicado validado em 11 jul 2026 nas rotas principais e sem canais de mensagem expostos

Ambientes conhecidos:
- frontend publicado: `https://caredesk-lou.pages.dev`
- worker publicado: `https://caredesk-worker.faugusto-thecoral.workers.dev`
- frontend local: `http://localhost:5173`
- worker local: `http://localhost:8787`

Ultima validacao publicada conhecida:
- data: `2026-07-11`
- dashboard publicado abriu com branding atual e sem flash do tema antigo
- lista de pacientes, detalhe do paciente e admin carregaram sem erros visiveis
- a rota `/patients` ainda mostra `Carregando ambiente...` por alguns instantes antes da tela estabilizar, mas conclui normalmente
- a UI validada nao exibiu mais termos ou acoes de WhatsApp, Telegram ou mensagens
- worker respondeu `200` em `/health`
- rotas antigas de mensagem retornaram `404`: `/api/whatsapp` e `/api/telegram`

Ajuste recente no CI:
- o workflow de deploy do GitHub agora valida explicitamente `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`
- o job de frontend tambem instala o `wrangler` antes do `pages deploy`, evitando falha por CLI ausente no ambiente

Ajuste recente de favicon:
- o frontend agora publica um favicon base ja no `index.html`, evitando que o navegador reutilize um icone residual antes do app hidratar
- em runtime, o app atualiza simultaneamente `rel="icon"`, `rel="shortcut icon"` e `rel="apple-touch-icon"`
- esse caminho e mais confiavel que atualizar apenas um unico `link[rel='icon']`, porque reduz cache agressivo e comportamento inconsistente entre navegadores

## Diretriz de storage

Direcao recomendada para a proxima fase:
- usar Cloudflare R2 apenas para arquivos pesados e binarios
- manter D1 como fonte principal dos dados operacionais e metadados

Arquivos que fazem sentido no storage:
- logo
- imagem de fundo
- imagem exclusiva da pagina de login
- favicon
- imagem de usuario, se essa feature existir
- anexos visuais de pacientes, como fotos e documentos escaneados

Arquivos que nao devem virar fonte principal no storage:
- cadastro de pacientes
- protocolos
- historico de contatos
- configuracoes operacionais

Regra pratica:
- arquivo grande vai para `R2`
- referencia, permissao, dono, tipo e contexto do arquivo ficam no `D1`

Decisao arquitetural atual:
- a intencao do projeto e usar storage principalmente para imagens e outros binarios pesados
- esse caminho e mais indicado do que salvar blobs grandes diretamente no banco

### Estrutura recomendada no R2

Namespaces recomendados:
- `branding/logos/`
- `branding/backgrounds/`
- `branding/login-images/`
- `branding/favicons/`
- `avatars/agents/`
- `avatars/patients/`
- `attachments/patients/`

Regras de uso:
- `branding/*`: assets globais da clinica usados no login, sidebar, dashboard e favicon
- `branding/login-images/*`: imagem exclusiva da lateral institucional da tela de login
- `avatars/agents/*`: foto de agentes e administrador
- `avatars/patients/*`: imagem de perfil do paciente, se essa feature entrar
- `attachments/patients/*`: imagens clinicas e anexos visuais relacionados ao paciente

Padrao de chave recomendado:
- usar UUID no nome final do arquivo
- manter prefixo por contexto
- nao depender do nome original como identificador

Exemplos:
- `branding/logos/550e8400-e29b-41d4-a716-446655440000.png`
- `avatars/patients/550e8400-e29b-41d4-a716-446655440000.webp`
- `attachments/patients/8f6c.../550e8400-e29b-41d4-a716-446655440000.jpg`

### Fluxo operacional recomendado

Fluxo de upload:
1. frontend envia arquivo para o worker
2. worker valida tipo, tamanho e contexto
3. worker grava binario no `R2`
4. worker salva no `D1` a referencia do arquivo e seus metadados
5. frontend passa a consumir a URL devolvida pelo worker

Fluxo de leitura:
1. frontend recebe a URL do asset a partir da API
2. worker busca o objeto no `R2`
3. worker devolve o arquivo com `content-type`, `etag` e politica de cache adequada

Fluxo de substituicao:
1. novo arquivo sobe para uma nova chave
2. referencia no `D1` aponta para o novo arquivo
3. arquivo antigo pode ser removido pelo worker depois da troca

Fluxo de remocao:
1. frontend solicita remocao
2. worker remove o objeto do `R2`
3. worker limpa a referencia no `D1`

### Metadados que devem ficar no D1

Mesmo quando o arquivo estiver no `R2`, o `D1` deve guardar:
- `owner_type`
- `owner_id`
- `storage_key`
- `public_url` ou URL servida pelo worker
- `mime_type`
- `file_size`
- `category`
- `uploaded_by`
- `created_at`
- `updated_at`

Para branding simples, como hoje:
- `logo_url`
- `background_image_url`
- `favicon_url`
- chaves internas de storage correspondentes

### Ordem recomendada de implementacao

Para sustentar melhor os ajustes visuais:
1. consolidar branding atual em `branding/logos`, `branding/backgrounds` e `branding/favicons`
2. padronizar o fluxo de upload para um unico contrato de assets
3. criar suporte a `avatars/agents`
4. depois expandir para `avatars/patients`
5. so depois abrir `attachments/patients`

### Criterio de design para a proxima fase

Regra simples para nao desorganizar o frontend:
- se o arquivo aparece na interface mas nao e dado de negocio, ele tende a ir para `R2`
- se o valor participa de filtro, regra, relacao, historico ou auditoria, ele tende a ficar no `D1`

### Estado implementado nesta rodada

Ja entrou no codigo:
- branding e `avatars/agents` agora compartilham o mesmo nucleo de storage no backend
- branding agora suporta uma imagem dedicada apenas para a pagina de login
- `agents` passou a ter `avatar_url` e `avatar_storage_key`
- o admin ja permite upload e remocao de avatar na edicao de agentes
- a shell principal e a lista da equipe ja renderizam avatar real com fallback por iniciais

Regra da tela de login:
- `login_image_url` usa asset proprio no `R2`
- se a imagem exclusiva do login estiver vazia, a tela permanece sem imagem
- a aba de identidade visual agora exibe preview especifico da tela de login

### Especificacao proposta para borda pulsante no login

Objetivo:
- adicionar uma borda animada ao card de login da direita, com linguagem premium e controlada
- manter a imagem institucional da esquerda utilizavel, sem competir visualmente com o efeito

Escopo visual recomendado:
- aplicar o efeito no container principal inteiro da tela de login
- nao aplicar o shader sobre a area da imagem institucional
- deixar o glass transparente restrito a coluna direita, sem transformar a area institucional em glass

Motivo da restricao:
- a imagem de login precisa continuar legivel e elegante
- o glow pode envolver o container inteiro, mas a leitura premium vem do contraste entre esquerda institucional e direita em glass

Configuracoes recomendadas na aba de identidade visual:
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

Controles que nao valem expor nesta fase:
- `spots`
- `spotSize`
- `smoke`
- `smokeSize`
- `scale`
- `rotation`
- `offsetX`
- `offsetY`
- `aspectRatio`

Razao:
- esses parametros aumentam complexidade demais para um painel administrativo que hoje precisa continuar simples e operacional

Comportamento esperado:
- quando desativado, o card continua com a borda estatica atual
- quando ativado, a borda pulsante envolve o card principal inteiro do login, e nao apenas o bloco de credenciais
- as cores do efeito devem ser definidas pela aba de identidade visual
- o efeito deve respeitar `prefers-reduced-motion` ou cair automaticamente para uma versao suavizada/estatica

Aprendizado aplicado em 11 jul 2026:
- nao basta salvar branding no `app_settings`; a tela publica precisa de uma rota publica sanitizada
- o worker agora deve expor apenas os campos visuais necessarios ao login e ao shell publico, sem abrir o mapa inteiro de configuracoes
- a miniatura da aba de identidade visual precisa reproduzir a composicao completa da tela de login, e nao apenas a faixa institucional
- a borda pulsante precisa de area visivel real no card; deixar apenas `1.5px` de faixa torna o efeito imperceptivel mesmo com parametros altos
- a aba de identidade visual nao deve manter uma segunda previa redundante do card de login; a referencia correta e uma unica composicao completa
- o `/login` nao deve pintar defaults antes do branding remoto publico carregar, ou a experiencia contradiz a identidade visual configurada

Refino visual consolidado em 12 jul 2026:
- o glow pulsante deve envolver o container principal do login inteiro
- o efeito glass deve ficar restrito apenas a coluna direita de acesso
- a area institucional da esquerda nao deve virar glass, para nao enfraquecer a imagem e o bloco editorial
- a previa administrativa precisa espelhar exatamente essa divisao: esquerda editorial solida e direita translúcida

Fallbacks obrigatorios:
- se a lib/shader falhar, o card deve manter uma borda estatica normal
- se houver imagem de login configurada, o efeito nao deve prejudicar leitura e contraste
- no mobile, o efeito deve poder ser simplificado ou reduzido

Validacao tecnica ja confirmada:
- a dependencia `@paper-design/shaders-react` instala no frontend atual com React 18
- o componente `PulsingBorder` existe de fato no pacote publicado
- os presets publicados encontrados sao:
  - `Default`
  - `Circle`
  - `Northern lights`
  - `Solid line`

Props reais confirmadas como base do shader:
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

Leitura consolidada:
- a integracao e viavel tecnicamente
- o melhor caminho continua sendo criar um wrapper local do CareDesk em vez de espalhar uso direto da lib na tela

Estado implementado desta frente:
- dependencia `@paper-design/shaders-react` instalada no frontend
- wrapper local criado em `frontend/src/components/ui/LoginPulsingBorder.jsx`
- o shader foi ligado apenas ao card de login
- a aba de identidade visual agora controla:
  - ativacao do efeito
  - preset
  - `color1`
  - `color2`
  - `color3`
  - `colorBack`
  - intensidade
  - velocidade
  - espessura
  - bloom

Otimizacao aplicada:
- o wrapper local agora usa import estatico para reduzir risco de nao renderizacao no login publico e na miniatura administrativa
- isso simplifica a renderizacao do efeito, mas elevou o bundle principal acima do alerta de `500 kB` no build atual

Rotas relevantes:
- `GET /api/agents`
- `POST /api/agents/:id/avatar`
- `DELETE /api/agents/:id/avatar`
- `GET /api/agents/avatar/:key`

Arquivos relevantes desta frente:
- `worker/migrations/0002_agent-avatars.sql`
- `worker/src/routes/agents.js`
- `worker/src/utils/storage.js`
- `frontend/src/components/common/Avatar.jsx`
- `frontend/src/pages/Admin.jsx`
- `frontend/src/components/layout/AppLayout.jsx`

## Estrutura principal

```text
caredesk-sprint/
├── frontend/
├── worker/
├── scripts/
├── backups/
├── README.md
└── Status.md
```

Arquivos-chave:
- `README.md`: visao operacional e caminho recomendado
- `Status.md`: espelho do estado real do projeto
- `worker/src/utils/protocols.js`: regra central de resolucao de protocolo
- `worker/src/utils/storage.js`: nucleo compartilhado dos assets em `R2`
- `worker/src/routes/patients.js`: contrato principal de pacientes
- `worker/src/services/scheduler.js`: geracao diaria de notificacoes internas

Higiene recente do repositório:
- arquivos de suporte local em `.codex/runtime/` foram removidos do workspace e agora ficam ignorados via `.gitignore`
- utilitarios nao integrados ao fluxo atual, como `worker/reset-admin-password.mjs` e `worker/wrangler.toml.example`, foram retirados para reduzir ruído

## Setup local recomendado

### Instalar dependencias

```powershell
cd worker
npm install

cd ..\frontend
npm install
```

### Inicializar D1 local

```powershell
cd worker
npm run db:init
```

### Subir worker local

Comando mais confiavel validado:

```powershell
cd worker
npx wrangler dev --local --var JWT_SECRET:dev-caredesk-local-secret-2026 --var APP_ENV:development
```

### Subir frontend local

```powershell
cd frontend
npm run dev
```

### Criar admin local

```powershell
cd worker
node scripts/create-admin.js admin CareDesk2026! Administrador
```

Credenciais locais validadas:
- usuario: `admin`
- senha: `CareDesk2026!`

## Fluxo local recomendado

1. subir frontend e worker localmente
2. validar login e rotas principais
3. fazer o bloco principal de alteracoes no `localhost`
4. testar antes de publicar
5. so no fim rodar build, versionamento e deploy

Sempre validar antes de considerar o ambiente pronto:
- frontend respondendo
- worker respondendo
- login funcionando

## Regra oficial de protocolos

O backend resolve protocolo nesta ordem:
1. protocolo vinculado ao paciente (`contact_protocols.days`)
2. protocolo default
3. `app_settings.contact_protocol_days`
4. `patients.protocol_days` apenas como compatibilidade final

Campos principais retornados pelo backend:
- `protocol_days_parsed`
- `protocol_days_source`
- `resolved_protocol_id`
- `resolved_protocol_name`
- `resolved_protocol_color`

Implicacoes praticas:
- scheduler e rotas de pacientes usam a mesma resolucao
- o protocolo vinculado prevalece sobre snapshots legados
- criacao e edicao de paciente tentam preservar `protocol_id` valido quando existe protocolo default

## D1: scripts oficiais

Em `worker/package.json`:

```powershell
npm run db:init
npm run db:init:remote
npm run db:backfill
npm run db:backfill:remote
npm run db:cleanup
npm run db:cleanup:remote
npm test
```

Migrations relevantes:
- `worker/migrations/0000_protocol-backfill.sql`
- `worker/migrations/0001_contact-cleanup.sql`

## Fluxo remoto do D1

### Carregar credenciais Cloudflare

```powershell
cd worker
. .\scripts\load-cloudflare-env.ps1
```

### Sequencia de saneamento usada com sucesso

```powershell
npm run db:backfill:remote
npm run db:cleanup:remote
```

Aprendizados importantes:
- comandos remotos precisam de `--remote`
- imports SQL remotos pelo Wrangler nao devem usar `BEGIN TRANSACTION` e `COMMIT`
- quando necessario, complementar validacoes com queries diretas usando `wrangler d1 execute ... --command`

## Estado do produto nesta fase

O CareDesk esta hoje centrado em:
- pacientes
- protocolos
- dashboard
- notificacoes internas
- registro manual de contatos

O modulo de mensagens foi retirado desta fase.

## Deploy

Scripts da raiz:

```powershell
npm run deploy:worker
npm run deploy:frontend
npm run deploy
```

Aliases explicitos para deploy manual:

```powershell
npm run deploy:manual:worker
npm run deploy:manual:frontend
npm run deploy:manual
```

Scripts dedicados:
- `scripts/deploy-worker.ps1`
- `scripts/deploy-frontend.ps1`
- `scripts/deploy-all.ps1`

Regra operacional importante:
- deploy manual por script local publica no Cloudflare, mas nao cria historico no GitHub Actions
- o GitHub Actions so lista execucoes do workflow em `.github/workflows/deploy.yml`
- por isso, commits locais nao enviados e deploys feitos direto com Wrangler nao aparecem na aba `Actions`

## Trilha oficial de publicacao

Fluxo oficial daqui para frente:
1. validar localmente
2. versionar no GitHub
3. deixar o deploy oficial acontecer via `GitHub Actions`
4. usar deploy manual apenas para validacao emergencial ou contingencia

Regras praticas:
- `GitHub Actions` e a trilha oficial de historico da evolucao
- `Cloudflare Pages` e `Workers` continuam recebendo a versao final publicada
- scripts locais existem para operacao manual, nao para substituir o historico do GitHub

## Ajuste do workflow de deploy

O workflow oficial agora foi alinhado para acompanhamento melhor da evolucao:
- nome do workflow: `Deploy CareDesk`
- `run-name` passa a refletir melhor a origem da publicacao
- `concurrency` continua serializando por branch, mas sem cancelar deploy anterior em andamento
- com `cancel-in-progress: false`, novos runs nao apagam a leitura da evolucao recente no `Actions`

Efeito esperado:
- o `Actions` passa a preservar melhor a sequencia de publicacoes
- a aba deixa de dar a sensacao de que um deploy substituiu o outro no proprio historico do GitHub
- continua existindo apenas um dominio principal publicado, mas com runs mais legiveis e rastreaveis

## Regra dura de consistencia entre GitHub e Cloudflare

Aprendizado operacional consolidado em `2026-07-12`:
- se uma mudanca visual existir apenas em deploy manual local, ela nao esta protegida
- no proximo `push`, o GitHub Actions publica o estado versionado do repositorio e pode sobrescrever a producao com um estado mais antigo

Conclusao obrigatoria:
- mudanca de interface que precisa sobreviver ao deploy oficial deve estar commitada e publicada no GitHub
- deploy manual serve para validar rapido, nao para definir sozinho o estado canonico do produto

Aplicacao pratica para o login:
- tela de login premium
- branding publico
- imagem exclusiva do login
- borda pulsante
- preview da aba de identidade visual

Tudo isso precisa existir no repositorio, no worker e no frontend ao mesmo tempo.

## Regra de revisionamento compativel

Padrao adotado a partir desta consolidacao:
- se o workspace local evoluir em uma frente estrutural relevante, o GitHub precisa ser atualizado na mesma rodada
- backend, frontend, migracoes e testes relacionados devem subir juntos quando formarem um pacote funcional unico
- nao deixar backlog grande de mudancas locais sem commit, porque isso distorce o estado real do produto

Objetivo pratico:
- repositorio e workspace devem continuar compatíveis
- o deploy oficial deve refletir o produto real
- o historico do Git deve explicar a evolucao do CareDesk em blocos legiveis

## Disciplina de documentacao

`README.md` e `Status.md` devem permanecer como memoria viva do projeto.

Sempre registrar:
- mudancas estruturais reais
- regras de negocio consolidadas
- comandos e fluxos que funcionaram de verdade
- armadilhas encontradas
- diferencas entre estado local, remoto e publicado
- limpeza de arquivos orfaos e artefatos temporarios quando ela alterar a forma correta de operar o projeto
