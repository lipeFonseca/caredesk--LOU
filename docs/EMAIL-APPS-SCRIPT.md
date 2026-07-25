# Envio de e-mail via Google Apps Script

O CareDesk envia e-mail só no fluxo "esqueci minha senha". O remetente é o Gmail
da clínica.

## Por que não é SMTP direto

Cloudflare Workers não abre conexão SMTP — é bloqueio antispam da própria
Cloudflare, não limitação de biblioteca. Por isso **senha de app do Gmail não
serve aqui**: ela só funciona para SMTP/IMAP.

O caminho é: Worker → `POST` HTTP → Apps Script → `MailApp.sendEmail()` → Gmail.

## Publicação (uma vez)

1. Acesse <https://script.google.com> logado na conta Google que vai ser a
   remetente, e crie um projeto novo.
2. Apague o conteúdo do `Código.gs` e cole o de [`apps-script-email.gs`](apps-script-email.gs).
3. Gere um token aleatório longo (serve `openssl rand -hex 32`, ou qualquer
   gerador de senha com 40+ caracteres).
4. No projeto: **Configurações do projeto → Propriedades do script → Adicionar
   propriedade**. Chave `RELAY_TOKEN`, valor o token gerado.
5. **Implantar → Nova implantação → tipo Aplicativo da Web**:
   - Executar como: **Eu** (é a conta que envia)
   - Quem pode acessar: **Qualquer pessoa**
6. Autorize quando o Google pedir. A tela de aviso "app não verificado" é
   esperada — é o seu próprio script; siga em **Avançado → Acessar projeto**.
7. Copie a **URL do aplicativo web** (termina em `/exec`).

> **Por que "qualquer pessoa":** o Worker chama a URL sem sessão Google. O
> `RELAY_TOKEN` é o que impede que alguém com a URL use sua conta como relay de
> spam. Trate a URL e o token como credenciais.

## Configuração no CareDesk

No painel: **Configurações → Mensageria**. Cole a URL `/exec` e o `RELAY_TOKEN`,
salve e use **Enviar e-mail de teste** para confirmar antes de depender do fluxo
de redefinição de senha.

O token é gravado em `app_settings` e **nunca volta em claro** — a tela mostra
só os últimos 4 caracteres. Deixar o campo mascarado como está preserva o valor
salvo; para trocar, digite o token novo por cima.

### Alternativa por variável de ambiente

Ainda funciona, como fallback para quem configurou antes da aba existir. O que
está em `app_settings` tem prioridade:

```powershell
cd worker
npx wrangler secret put EMAIL_RELAY_URL     # a URL /exec da implantação
npx wrangler secret put EMAIL_RELAY_TOKEN   # o mesmo RELAY_TOKEN do script
```

Para desenvolvimento local, as mesmas duas chaves vão em `worker/.dev.vars`
(arquivo já coberto pelo `.gitignore`).

## Limites

- Conta Gmail gratuita: **~100 destinatários/dia**. Workspace: ~1.500/dia.
- O uso previsto é reset de senha (poucos por dia), então a cota não é tratada
  em código. O campo `remainingQuota` volta em toda resposta de envio, se algum
  dia precisar diagnosticar.

## Ao republicar o script

Editar o código **não** atualiza a implantação sozinho. Use **Implantar →
Gerenciar implantações → editar (ícone de lápis) → Versão: Nova versão**. Criar
uma implantação nova do zero gera **URL diferente**, e aí o secret
`EMAIL_RELAY_URL` do Worker precisa ser atualizado junto.

## Teste rápido

```powershell
curl.exe -sS -X POST "<URL_DO_APPS_SCRIPT>" -H "Content-Type: application/json" -d '{\"token\":\"<RELAY_TOKEN>\",\"to\":\"destino@exemplo.com\",\"subject\":\"Teste CareDesk\",\"html\":\"<p>Funcionou.</p>\"}'
```

Resposta esperada: `{"ok":true,"remainingQuota":<número>}`. Se vier
`{"ok":false,"error":"unauthorized"}`, o token do script e o do comando estão
diferentes.
