# Diretrizes de trabalho — CareDesk

Valem em toda sessão deste projeto, sem precisar ser reativadas.

## Comunicação

- PT-BR sempre.
- Resumo curto ao final da tarefa: **o quê** mudou, **por quê**, **quais arquivos**, **próximo passo**. Sem aula, sem enrolação.
- Aprofundamento técnico (trade-offs, alternativas, explicação longa) só quando pedido.
- Se a abordagem pedida tiver problema real (vai quebrar, escala mal, é gambiarra): avisar em 1-2 frases ANTES de executar e propor alternativa. Decisão mantida depois do aviso = executa sem reabrir debate.

## Quando parar e perguntar

Só nestes dois casos:

1. **Mudança arquitetural** — estrutura de pastas, modelo de dados, contrato de API, nova dependência, padrão de estado/infra.
2. **Ação destrutiva/irreversível** — deletar arquivo ou tabela, sobrescrever config de produção, force push, migration com perda de dado.

Fora disso: executar. Pedir permissão pra renomear variável, corrigir bug já mapeado ou implementar algo já combinado é ruído.

## Código — padrão sênior humanizado

- Nome de domínio, completo e descritivo: `pacientesComMarcoVencido`, nunca `data`/`result`/`temp2`. Português quando o termo é do domínio clínico.
- Funções pequenas, responsabilidade única.
- Idioma do framework em uso: Hono do jeito Hono, React do jeito React. Não impor estilo universal por cima.
- Comandos de CLI em bloco único, nunca fragmentados.

### Vícios de código gerado por IA — evitar ativamente

- Comentário linha a linha do óbvio (`// incrementa i`). Comentário diz o **porquê**, ou não existe.
- Abstração prematura: interface/classe/camada pra caso de uso único "porque é boa prática". Extrair só com reuso real ou ganho concreto de clareza.
- `try/catch` guarda-chuva que engole tudo. Tratar o erro que realmente acontece naquele contexto; deixar o resto estourar.
- Código defensivo pra caso que a arquitetura já impede (validação duplicada em toda camada).
- Reinventar o que a stdlib/framework já resolve.

### Observações de manutenção

Marcar no código só onde alguém novo erraria sem o contexto:

- `// ASSUME:` — dependência não validada (ex: fuso, formato de data externo).
- `// LIMITAÇÃO:` — dívida deixada de propósito, com o porquê.
- Efeito colateral não óbvio — função que também grava cache, dispara notificação, chama webhook.
- Ponto frágil — onde uma mudança externa razoável derruba o código.
- Trade-off de decisão, só quando não é óbvio olhando o código.

Não comentar tudo. Só o que não se lê no código.

## Execução

- Edição pontual (diff/str_replace) em vez de reescrever arquivo inteiro.
- Não repetir de volta código que já está no arquivo ou que o usuário colou — referenciar por `arquivo:linha`.
- Não narrar "vou fazer X agora" antes de cada passo. Executar e resumir no fim.
- Tarefa grande: quebrar em etapas com resumo curto por etapa.

## Validação

O usuário valida UI e navegador. Claude fica com backend, config, teste automatizado e criação de arquivo — nunca Playwright/browser automation, acessar apenas se o usuário mandar.

## Contexto do projeto (onde olhar, não duplicar aqui)

- `Status.md` — linha do tempo cronológica estrita do que já foi decidido e entregue. Estado de hoje de qualquer assunto = entrada mais recente daquele assunto. Atualização nova sempre vira entrada no fim, na data do dia.
- `ARQUITETURA.md` — mapa arquivo-por-arquivo: responsabilidade, rotas, dependências. Pode estar defasado; confirmar contra o código antes de agir.
- `README.md` — visão operacional.

Ambos devem ser atualizados a cada mudança estrutural — regra do projeto.

## Regras duras herdadas de incidente real

- **Nada visual/estrutural fica só em deploy manual.** Estado canônico mora no GitHub antes do próximo deploy oficial, ou o Actions republica o repo e derruba a mudança.
- **Migration remota multi-instrução:** confirmar resultado real via `sqlite_master` depois de rodar. Nunca confiar só no exit code.
- **D1 local e D1 remoto são bancos separados.** Dado, credencial e migration aplicada num não existem no outro.
- **Depois de mexer em dependência dev:** `rm -rf node_modules && npm ci` local antes de subir — replica o passo exato do CI.
- **ACL quebrada (Codex/Windows):** corrigir sempre no caminho específico afetado (`takeown /F <caminho> /R /D Y` + `icacls <caminho> /reset /T`). Nunca resetar a raiz do repo.

## Prioridade oficial do projeto

**segurança > saúde do banco > fluidez**
