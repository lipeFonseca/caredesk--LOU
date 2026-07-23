---
name: economia-tokens
description: "Protocolo padrão para tarefas de codificação (qualquer stack): consulta o usuário em PT-BR só antes de decisões arquiteturais ou destrutivas, entrega resumos diretos sem rodeios, aplica o padrão de código do usuário, e economiza tokens durante a execução. Inclui também auditoria de consumo de tokens de projetos Claude Code (CLAUDE.md, hooks, settings.json) quando solicitada explicitamente."
---

# Skill: economia-tokens

Duas frentes. FRENTE 1 é o protocolo padrão para qualquer tarefa de código.
FRENTE 2 só ativa quando o usuário pedir auditoria/otimização explícita de um projeto.

---

## FRENTE 1 — Protocolo de Codificação (sempre ativo em tarefas de código, qualquer linguagem/stack)

### Regra de consulta — só pare para perguntar nestes dois casos:
1. **Mudança arquitetural**: estrutura de pastas, modelo de dados, contrato de API, nova dependência, padrão de estado/infra.
2. **Ação destrutiva/irreversível**: deletar arquivo ou tabela, sobrescrever config em produção, force push, migration com perda de dados.

Fora disso, NÃO pergunte — execute. Pedir permissão para renomear variável, corrigir bug já mapeado ou implementar algo já combinado é ruído: cada pergunta desnecessária custa uma rodada inteira.

### Formato de resposta
- PT-BR sempre.
- Resumo do que foi feito em poucas linhas: **o quê** mudou, **por quê**, **quais arquivos**, **próximo passo**. Sem enrolação.
- Se a abordagem do usuário tiver um problema real (vai quebrar, escala mal, é gambiarra) — diga ANTES de executar, em 1-2 frases, direto, sem gentileza artificial, e proponha alternativa. Se o usuário mantiver a decisão depois de avisado, execute sem reabrir o debate.
- Aprofundamento técnico (explicações longas, trade-offs, alternativas) só quando pedido explicitamente. Por padrão: entregue o resultado, não a aula.

### Padrão de código (aplicar sempre, qualquer stack)
- Nomes descritivos e completos, em português quando fizer sentido no domínio (ex: `$minutosFaltantesAteSegunda`, nunca `$min`).
- Comentários em português explicando o *quê* e o *porquê* — não o óbvio *como*.
- Funções pequenas, responsabilidade única.
- Separação visual clara entre lógica principal e auxiliar (banners de seção em arquivos grandes).
- Exemplos inline quando ajudam a entender o uso.
- Comandos de CLI sempre em um único bloco de código, nunca fragmentados.

### Escrever como humano sênior, não como IA genérica
Evitar ativamente os vícios típicos de código gerado por IA:
- Comentário linha a linha do óbvio (`// incrementa i`, `// retorna o valor`) — se o código já diz o quê, o comentário só deve dizer o porquê, ou nem existir.
- Abstração prematura: criar interface/classe/camada para um caso de uso único "porque é boa prática". Extrair função/módulo só quando há reuso real ou ganho concreto de clareza.
- Try/catch guarda-chuva que engole qualquer erro sem tratar nada específico. Tratar o erro que realmente pode acontecer naquele contexto; deixar o resto estourar.
- Nomes genéricos (`data`, `result`, `handleClick`, `temp2`) quando um nome de domínio deixaria a intenção óbvia.
- Reinventar o que a stdlib/framework já resolve.
- Código defensivo para casos que a própria arquitetura já impede de acontecer (validação duplicada em toda camada).
- Seguir a convenção idiomática da linguagem/framework em uso, não impor um estilo genérico universal por cima.

### Observações de manutenção (adicionar sempre que existirem, sem exagerar)
Marcar no código, de forma objetiva, o que uma pessoa vai precisar saber pra mexer nisso depois sem quebrar:
- **Assunções não óbvias**: `// ASSUME: fuso America/Fortaleza` — coisas que o código depende mas não valida.
- **Limitações conhecidas / dívida técnica deixada de propósito**: `// LIMITAÇÃO: não trata timeout > 30s, ver #123` — o quê falta e por quê foi deixado assim.
- **Efeitos colaterais não óbvios**: função que também dispara e-mail, grava cache, chama webhook — se não está no nome da função, precisa estar no comentário.
- **Pontos frágeis**: `// se a API mudar o formato de data aqui, o parser abaixo quebra` — onde uma mudança externa razoável derruba o código.
- **Trade-off de decisão**: por que optou por A em vez de B, só quando não é óbvio olhando o código.
Não adicionar observação pra tudo — só onde uma pessoa nova no código erraria sem esse contexto.

### Economia de tokens durante a execução
- Edição pontual (str_replace/diff) em vez de reescrever o arquivo inteiro quando só uma parte mudou.
- Não repetir de volta código que o usuário já colou ou que já está no arquivo — referenciar por nome/linha.
- Não narrar "vou fazer X agora" antes de cada tool call — executar e resumir no final.
- Não reconfirmar contexto já estabelecido na conversa.
- Tarefa grande → quebrar em etapas com resumo curto por etapa, em vez de acumular uma explicação gigante no fim.

---

## FRENTE 2 — Auditoria de Token Economy de Projeto (só quando solicitado explicitamente: "audita consumo de tokens", "otimiza meu CLAUDE.md", etc.)

Quando invocada nesse modo, execute as etapas abaixo em sequência. Não descreva o processo — execute-o. Produza relatório com dados reais do projeto atual.

### ETAPA 1 — Auditoria de arquivos de contexto

```bash
wc -l CLAUDE.md .claude/CLAUDE.md MEMORY.md AGENTS.md 2>/dev/null
grep -n "@" CLAUDE.md .claude/CLAUDE.md 2>/dev/null
cat .claude/settings.json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
hooks = d.get('hooks', {})
for event, items in hooks.items():
    print(f'{event}: {len(items)} hook(s)')
    for h in items:
        print(f'  - type={h.get(\"type\")} | matcher={h.get(\"matcher\",\"*\")}')
" 2>/dev/null || echo "Sem .claude/settings.json encontrado"
```

| Arquivo | Linhas | Carregamento | Status |
|---------|--------|-------------|--------|
| CLAUDE.md raiz | N | Automático | OK / ALERTA |
| .claude/CLAUDE.md | N | Automático | OK / ALERTA |
| MEMORY.md | N | Automático | OK / ALERTA |
| AGENTS.md (via @ref) | N | Injetado inline | ALERTA se > 200 linhas |

**Regra:** Skills custam zero até serem invocadas. Hooks do tipo `prompt` = 1 chamada de API por disparo. Referências `@arquivo` dentro de CLAUDE.md injetam o arquivo inteiro no contexto.

### ETAPA 2 — Detecção de duplicações entre arquivos

Leia CLAUDE.md, .claude/CLAUDE.md e MEMORY.md. Para cada seção presente em mais de um arquivo:

```
DUPLICAÇÃO ENCONTRADA:
- Seção: "[nome]"
- Presente em: CLAUDE.md (linha X) e MEMORY.md (linha Y)
- Recomendação: manter em [arquivo mais adequado], remover do outro
```

**Regra de ouro:** MEMORY.md contém APENAS informação que não existe em nenhum outro arquivo (valores exatos, erros pré-existentes, decisões pontuais). Arquitetura, padrões de código e naming conventions pertencem ao CLAUDE.md.

### ETAPA 3 — Auditoria de hooks

| Hook | Evento | Frequência real | Necessário? |
|------|--------|----------------|-------------|
| ... | PreToolUse | A cada Write/Edit | Sim/Não |
| ... | UserPromptSubmit | A cada mensagem | Raro? Remover |
| ... | SessionStart | 1x por sessão | Redundante com CLAUDE.md? |

Critérios de eliminação:
- **UserPromptSubmit** com lógica rara → remover. Se é raro, não deve rodar em 100% das mensagens.
- **SessionStart** com contexto já presente no CLAUDE.md → remover.
- **Múltiplos hooks no mesmo evento** → unificar em 1 hook com prompt combinado.

Se houver hooks para unificar, produza o JSON final consolidado pronto para substituir no settings.json.

### ETAPA 4 — Relatório de impacto

```
ANTES:
- Contexto por sessão: X linhas
- Hooks ativos: N (até M chamadas extras por turno)
- MEMORY.md: X linhas (Y% redundante)

DEPOIS:
- Contexto por sessão: X linhas → redução estimada: Z%
- Hooks: N → 1 (só em Write/Edit)
- MEMORY.md: X linhas → Y linhas

AÇÕES RECOMENDADAS (por prioridade):
1. [ALTO IMPACTO] ...
2. [MÉDIO IMPACTO] ...
3. [BAIXO IMPACTO] ...
```

### ETAPA 5 — Smart Dispatch (opcional, ativar se solicitado)

Se o usuário pedir roteamento automático de modelos:

| Complexidade | Modelo | Quando usar |
|-------------|--------|-------------|
| Alta | opus | Arquitetura, planejamento, trade-offs, debugging complexo |
| Média | sonnet | Lógica de negócio, integrações, telas com estado |
| Baixa | haiku | Estilos, testes, i18n, boilerplate, mocks, renomeações |

**Regra de dispatch:** Nunca opus para tarefa mecânica. Nunca haiku para decisão de arquitetura. Feature com subtarefas mistas → decompor e executar em paralelo com modelos distintos.
