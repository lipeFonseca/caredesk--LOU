-- Templates de e-mail editaveis pelo admin (aba Mensageria).
--
-- Tabela propria em vez de app_settings: corpo de e-mail e texto longo, e
-- app_settings e chave/valor curto usado por configuracao pontual.
--
-- `tipo` e UNIQUE porque cada tipo tem exatamente um template ativo — nao ha
-- versionamento nem multiplos templates por tipo (nao foi pedido, e um catalogo
-- de versoes sem quem consulte so acumula linha).

CREATE TABLE IF NOT EXISTS email_templates (
  tipo       TEXT PRIMARY KEY CHECK (tipo IN ('password_reset', 'daily_digest')),
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Conteudo inicial. O de password_reset reproduz o HTML que estava fixo em
-- services/email.js, pra troca de fonte nao mudar o que o usuario ja recebe.
INSERT OR IGNORE INTO email_templates (tipo, subject, body_html) VALUES (
  'password_reset',
  '{{clinic_name}} — código para redefinir sua senha',
  '<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1b1f; line-height: 1.6;">
  <p>Olá, {{agent_name}}.</p>
  <p>Recebemos um pedido para redefinir a senha da sua conta no {{clinic_name}}. Use o código abaixo:</p>
  <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0; color: #18352d;">{{code}}</p>
  <p>O código vale por {{expires_in_minutes}} minutos e só pode ser usado uma vez.</p>
  <p style="color: #6b6b6b;">Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.</p>
</div>'
);

INSERT OR IGNORE INTO email_templates (tipo, subject, body_html) VALUES (
  'daily_digest',
  '{{clinic_name}} — seu dia {{today_date}} e a agenda de amanhã',
  '<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1b1f; line-height: 1.6;">
  <p>Boa noite, {{agent_name}}.</p>

  <h2 style="font-size: 18px; margin: 24px 0 8px;">Seu dia ({{today_date}})</h2>
  <ul>
    <li><strong>{{contacts_logged}}</strong> contato(s) registrado(s)</li>
    <li><strong>{{reached_count}}</strong> paciente(s) alcançado(s)</li>
    <li><strong>{{no_answer_count}}</strong> sem resposta</li>
    <li><strong>{{callback_count}}</strong> retorno(s) agendado(s)</li>
  </ul>

  <h2 style="font-size: 18px; margin: 24px 0 8px;">Amanhã ({{tomorrow_date}})</h2>
  <p>{{tomorrow_total}} paciente(s) para contatar:</p>
  {{tomorrow_list}}

  <p style="color: #6b6b6b; margin-top: 24px;">Este resumo é automático. Os detalhes estão sempre no painel.</p>
</div>'
);
