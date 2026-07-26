import test from 'node:test'
import assert from 'node:assert/strict'

import { sendEmail } from '../src/services/email.js'
import { validateAgentEmail } from '../src/utils/contactFields.js'
import { criarFakeD1 } from './helpers/fakeD1.js'

// ── Envio ────────────────────────────────────────────────────

function ambienteComConfig(config = {}) {
  const linhas = Object.entries(config).map(([key, value]) => ({ key, value }))
  return { DB: criarFakeD1([{ match: 'app_settings', results: linhas }]) }
}

test('sendEmail recusa envio quando a mensageria está desligada', async () => {
  const env = ambienteComConfig({
    email_enabled: '0',
    email_relay_url: 'https://script.google.com/exec',
    email_relay_token: 'tok',
  })

  await assert.rejects(
    () => sendEmail(env, { to: 'a@b.com', subject: 'x', html: '<p>x</p>' }),
    /desativado/i
  )
})

test('sendEmail recusa envio sem URL ou token', async () => {
  await assert.rejects(
    () => sendEmail(ambienteComConfig({ email_relay_url: 'https://x/exec' }), { to: 'a@b.com', subject: 'x', html: 'x' }),
    /nao configurado/i
  )
  await assert.rejects(
    () => sendEmail(ambienteComConfig({ email_relay_token: 'tok' }), { to: 'a@b.com', subject: 'x', html: 'x' }),
    /nao configurado/i
  )
})

test('sendEmail manda o token no corpo, nunca em header', async () => {
  // O Apps Script redireciona internamente e headers customizados se perdem no
  // salto — foi assim que a integração passou a funcionar.
  const env = ambienteComConfig({
    email_relay_url: 'https://script.google.com/exec',
    email_relay_token: 'token-secreto',
    email_from_name: 'Clinica X',
  })

  let requisicao = null
  globalThis.fetch = async (url, opcoes) => {
    requisicao = { url, opcoes }
    return { ok: true, async text() { return JSON.stringify({ ok: true, remainingQuota: 42 }) } }
  }

  const resultado = await sendEmail(env, { to: 'paciente@x.com', subject: 'Oi', html: '<p>Oi</p>' })

  const corpo = JSON.parse(requisicao.opcoes.body)
  assert.equal(corpo.token, 'token-secreto')
  assert.equal(corpo.fromName, 'Clinica X')
  assert.equal(requisicao.opcoes.headers.Authorization, undefined)
  assert.equal(resultado.remainingQuota, 42)
})

test('sendEmail trata 200 com corpo de erro como falha', async () => {
  // Apps Script responde 200 mesmo em erro de aplicação: o status sozinho não
  // serve como confirmação de entrega.
  const env = ambienteComConfig({
    email_relay_url: 'https://script.google.com/exec',
    email_relay_token: 'tok',
  })

  globalThis.fetch = async () => ({
    ok: true,
    async text() { return JSON.stringify({ ok: false, error: 'unauthorized' }) },
  })

  await assert.rejects(
    () => sendEmail(env, { to: 'a@b.com', subject: 'x', html: 'x' }),
    /unauthorized/
  )
})

test('sendEmail explica quando a resposta não é JSON', async () => {
  // Página de login do Google no lugar do JSON = implantação com acesso errado.
  const env = ambienteComConfig({
    email_relay_url: 'https://script.google.com/exec',
    email_relay_token: 'tok',
  })

  globalThis.fetch = async () => ({ ok: true, async text() { return '<!DOCTYPE html><html>' } })

  await assert.rejects(
    () => sendEmail(env, { to: 'a@b.com', subject: 'x', html: 'x' }),
    /Resposta inesperada/
  )
})

// ── E-mail de agente ─────────────────────────────────────────

test('validateAgentEmail exige endereço real', () => {
  // "admin" sem @ passou pela validação antiga e custou uma sessão de
  // diagnóstico: o envio reportava sucesso e ninguém recebia.
  assert.equal(validateAgentEmail('admin').status, 400)
  assert.match(validateAgentEmail('admin').error, /endereço real/)
  assert.equal(validateAgentEmail('').status, 400)
  assert.equal(validateAgentEmail(undefined).status, 400)
  assert.equal(validateAgentEmail('sem-dominio@').status, 400)
  assert.equal(validateAgentEmail('a@b').status, 400)
})

test('validateAgentEmail normaliza para minúsculo e sem espaços', () => {
  assert.deepEqual(validateAgentEmail('  Ana.Souza@Clinica.COM '), { value: 'ana.souza@clinica.com' })
})
