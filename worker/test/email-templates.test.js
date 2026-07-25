import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isValidEmailTemplateType,
  renderEmailTemplate,
  validateEmailTemplatePayload,
  escaparHtml,
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_PLACEHOLDERS,
} from '../src/utils/emailTemplates.js'

test('isValidEmailTemplateType aceita so os tipos conhecidos', () => {
  assert.equal(isValidEmailTemplateType('password_reset'), true)
  assert.equal(isValidEmailTemplateType('daily_digest'), true)
  assert.equal(isValidEmailTemplateType('marketing'), false)
  assert.equal(isValidEmailTemplateType(''), false)
})

test('todo tipo declarado tem lista de placeholders', () => {
  for (const tipo of EMAIL_TEMPLATE_TYPES) {
    assert.ok(Array.isArray(EMAIL_TEMPLATE_PLACEHOLDERS[tipo]), `faltou placeholders de ${tipo}`)
    assert.ok(EMAIL_TEMPLATE_PLACEHOLDERS[tipo].length > 0)
  }
})

test('renderEmailTemplate substitui placeholder no assunto e no corpo', () => {
  const { subject, html } = renderEmailTemplate(
    { subject: '{{clinic_name}} — código', body_html: '<p>Olá, {{agent_name}}. Código: {{code}}</p>' },
    { clinic_name: 'Clinica X', agent_name: 'Ana', code: '123456' }
  )

  assert.equal(subject, 'Clinica X — código')
  assert.equal(html, '<p>Olá, Ana. Código: 123456</p>')
})

test('renderEmailTemplate escapa valor interpolado, mantendo o HTML do template', () => {
  // O template e escrito pelo admin (confiavel); o nome vem do banco.
  const { html } = renderEmailTemplate(
    { subject: 'x', body_html: '<p>Olá, {{agent_name}}.</p>' },
    { agent_name: '<img src=x onerror=alert(1)>' }
  )

  assert.ok(html.startsWith('<p>Olá, &lt;img'))
  assert.ok(!html.includes('<img src=x'))
})

test('renderEmailTemplate nao escapa a lista de pacientes, que ja e HTML pronto', () => {
  const listaMontadaPeloSistema = '<ul><li><strong>Ana</strong></li></ul>'

  const { html } = renderEmailTemplate(
    { subject: 'x', body_html: '<div>{{tomorrow_list}}</div>' },
    { tomorrow_list: listaMontadaPeloSistema }
  )

  assert.equal(html, `<div>${listaMontadaPeloSistema}</div>`)
})

test('renderEmailTemplate devolve assunto como texto puro, sem entidade HTML', () => {
  // Assunto nao e HTML: "&amp;" apareceria literal pra quem le.
  const { subject } = renderEmailTemplate(
    { subject: '{{clinic_name}} — resumo', body_html: '<p>x</p>' },
    { clinic_name: 'Silva & Filhos' }
  )

  assert.equal(subject, 'Silva & Filhos — resumo')
})

test('escaparHtml cobre os cinco caracteres perigosos e trata nulo', () => {
  assert.equal(escaparHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;')
  assert.equal(escaparHtml(null), '')
  assert.equal(escaparHtml(undefined), '')
})

test('validateEmailTemplatePayload exige assunto e corpo, e faz trim', () => {
  assert.equal(validateEmailTemplatePayload({ subject: '  ', body_html: '<p>x</p>' }).status, 400)
  assert.equal(validateEmailTemplatePayload({ subject: 'Oi', body_html: '   ' }).status, 400)

  assert.deepEqual(
    validateEmailTemplatePayload({ subject: '  Oi  ', body_html: '  <p>x</p>  ' }),
    { subject: 'Oi', body_html: '<p>x</p>' }
  )
})

test('validateEmailTemplatePayload recusa script no corpo', () => {
  const comScript = validateEmailTemplatePayload({
    subject: 'Oi',
    body_html: '<p>x</p><script>alert(1)</script>',
  })

  assert.equal(comScript.status, 400)
  assert.match(comScript.error, /script/i)
})

test('validateEmailTemplatePayload limita tamanho de assunto e corpo', () => {
  assert.equal(validateEmailTemplatePayload({ subject: 'a'.repeat(201), body_html: '<p>x</p>' }).status, 400)
  assert.equal(validateEmailTemplatePayload({ subject: 'Oi', body_html: 'a'.repeat(20001) }).status, 400)
})
