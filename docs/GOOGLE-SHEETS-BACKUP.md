# Backup diário para Google Planilhas

O CareDesk exporta `agents`, `contact_protocols`, `patients` e
`followup_logs` para uma Google Planilha todo dia às 00h (Fortaleza), e
consegue **restaurar** esses dados de volta no D1 a partir dela em caso de
desastre. Ver a seção "Backup e restore" do `README.md` para o desenho
completo (por que essas tabelas, o que fica de fora, o runbook de restore).

## Por que não é a API do Google Sheets direto

Assim como o e-mail (`docs/EMAIL-APPS-SCRIPT.md`), falar a API do Sheets
direto do Worker exigiria OAuth2/service account — mais uma credencial pra
gerenciar, mais superfície de configuração. O caminho é o mesmo já usado pro
e-mail: Worker → `POST` HTTP → Apps Script → `SpreadsheetApp`.

**Publicação separada do relay de e-mail, de propósito**: mesmo padrão de
ponte, mas token e planilha próprios. Pode (e é recomendado) usar uma conta
Google **diferente** da que envia e-mail — um token vazado ou uma conta
comprometida não derruba as duas coisas juntas.

## Publicação (uma vez)

1. Crie uma **Google Planilha nova**, vazia, na conta Google que vai guardar
   o backup (pode ser a mesma do e-mail ou uma conta separada — recomendado
   separada). Copie o **ID da planilha** da URL: `.../spreadsheets/d/<ID>/edit`.
2. Acesse <https://script.google.com> logado nessa mesma conta e crie um
   projeto novo.
3. Apague o conteúdo do `Código.gs` e cole o de [`apps-script-backup.gs`](apps-script-backup.gs).
4. Gere um token aleatório longo (`openssl rand -hex 32`, ou qualquer gerador
   de senha com 40+ caracteres) — **diferente** do `RELAY_TOKEN` do e-mail.
5. **Configurações do projeto → Propriedades do script → Adicionar
   propriedade**, duas vezes:
   - Chave `RELAY_TOKEN`, valor o token gerado no passo 4.
   - Chave `SPREADSHEET_ID`, valor o ID copiado no passo 1.
6. **Implantar → Nova implantação → tipo Aplicativo da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Autorize quando o Google pedir (tela "app não verificado" é esperada —
   é o seu próprio script; **Avançado → Acessar projeto**).
8. Copie a **URL do aplicativo web** (termina em `/exec`).

> **Por que "qualquer pessoa" mesmo a planilha sendo privada**: o Worker
> chama a URL sem sessão Google, então o Web App precisa aceitar chamada sem
> login — quem protege é o `RELAY_TOKEN`, não a permissão de acesso do Web
> App. A planilha em si **continua privada**, só a conta Google dona dela
>(e quem ela compartilhar manualmente) consegue abrir pelo navegador.

## Configuração no CareDesk

No painel: **Configurações → Backup**. Cole a URL `/exec` e o `RELAY_TOKEN`
gerados acima, ligue "Backup diário ativo", salve e use **Testar conexão**
antes de depender do backup de verdade.

O token é gravado em `app_settings` e **nunca volta em claro** — mesma regra
do token de e-mail (só os últimos 4 caracteres aparecem, mascarado).

## O que vai pra planilha (e o que não vai)

Quatro abas: **Agentes**, **Protocolos**, **Pacientes**, **Contatos**. As
três primeiras são reescritas por inteiro toda noite (foto do estado atual);
Contatos só recebe linha nova (histórico, nunca reescrito). `password_hash`
de agente e `cpf` de paciente **nunca saem do D1** — ver README para o porquê
de cada exclusão.

## Restore (dia do desastre)

```powershell
cd worker
node scripts/restore-from-backup.js                       # dry-run
node scripts/restore-from-backup.js --remote --confirm    # restaura de verdade
```

Detalhes no README, seção "Backup e restore".

## Ao republicar o script

Editar o código **não** atualiza a implantação sozinho. Use **Implantar →
Gerenciar implantações → editar (ícone de lápis) → Versão: Nova versão**.
Criar uma implantação nova do zero gera **URL diferente** — atualize o campo
de URL na aba Backup em seguida.
