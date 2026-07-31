-- Resumo noturno ganha atrasados e um grafico do dia (barra em tabela HTML —
-- cliente de e-mail nao roda JS nem renderiza SVG/canvas de forma confiavel).
-- Motivado por producao real em 2026-07-30: 7 pacientes ativos, 6 atrasados,
-- e o resumo enviado aos dois admins mostrava tudo zerado — os pacientes nao
-- tem assigned_agent_id e o resumo so olhava a carteira do proprio agente.
--
-- UPDATE condicional: so troca o corpo se ainda for exatamente o texto
-- semeado em 0017 (ninguem editou pelo painel ainda). Editar direto no admin
-- sempre venceria uma migration futura de qualquer forma, mas assim tambem
-- nao pisa em cima de uma customizacao ja feita.
UPDATE email_templates
SET
  body_html = '<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1b1f; line-height: 1.6;">
  <p>Boa noite, {{agent_name}}.</p>

  <h2 style="font-size: 18px; margin: 24px 0 8px;">Seu dia ({{today_date}})</h2>
  <ul>
    <li><strong>{{contacts_logged}}</strong> contato(s) registrado(s)</li>
    <li><strong>{{reached_count}}</strong> paciente(s) alcançado(s)</li>
    <li><strong>{{no_answer_count}}</strong> sem resposta</li>
    <li><strong>{{callback_count}}</strong> retorno(s) agendado(s)</li>
  </ul>
  {{today_chart}}

  <h2 style="font-size: 18px; margin: 24px 0 8px; color: #c62828;">Atrasados ({{overdue_count}})</h2>
  <div style="background: #fdecea; border-left: 4px solid #c62828; padding: 12px 16px; border-radius: 4px;">
    {{overdue_list}}
  </div>

  <h2 style="font-size: 18px; margin: 24px 0 8px;">Amanhã ({{tomorrow_date}})</h2>
  <p>{{tomorrow_total}} paciente(s) para contatar:</p>
  {{tomorrow_list}}

  <p style="color: #6b6b6b; margin-top: 24px;">Este resumo é automático. Os detalhes estão sempre no painel.</p>
</div>',
  updated_at = datetime('now')
WHERE tipo = 'daily_digest'
  AND body_html = '<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1b1f; line-height: 1.6;">
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
</div>';
