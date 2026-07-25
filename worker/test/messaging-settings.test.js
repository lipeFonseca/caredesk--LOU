import test from 'node:test'
import assert from 'node:assert/strict'

import {
  maskSecret,
  isMaskedValue,
  redactSettings,
  resolveEmailConfig,
  SECRET_SETTING_KEYS,
} from '../src/utils/messagingSettings.js'

// D1 falso que devolve as linhas de app_settings pedidas.
function fakeDb(linhas) {
  return {
    prepare() {
      return {
        bind() {
          return { async all() { return { results: linhas } } }
        },
      }
    },
  }
}

test('maskSecret mostra so os ultimos 4 caracteres', () => {
  const mascarado = maskSecret('token-super-secreto-1234')

  assert.ok(mascarado.endsWith('1234'))
  assert.ok(!mascarado.includes('super'))
  assert.ok(!mascarado.includes('secreto'))
})

test('maskSecret nao revela nada de token curto, e devolve vazio pra ausente', () => {
  assert.ok(!maskSecret('abcd').includes('abcd'))
  assert.equal(maskSecret(''), '')
  assert.equal(maskSecret(null), '')
})

test('isMaskedValue reconhece o valor devolvido pelo formulario sem edicao', () => {
  assert.equal(isMaskedValue(maskSecret('token-1234')), true)
  assert.equal(isMaskedValue('token-de-verdade'), false)
  assert.equal(isMaskedValue(''), false)
  assert.equal(isMaskedValue(undefined), false)
})

const SETTINGS_DE_EXEMPLO = {
  clinic_name: 'Clinica X',
  email_enabled: '1',
  email_relay_url: 'https://script.google.com/exec',
  email_relay_token: 'token-super-secreto-1234',
  email_from_name: 'Clinica X',
}

test('redactSettings mascara o token pro admin e preserva o resto', () => {
  const redigido = redactSettings(SETTINGS_DE_EXEMPLO, { isAdmin: true })

  assert.equal(redigido.clinic_name, 'Clinica X')
  assert.equal(redigido.email_relay_url, 'https://script.google.com/exec')
  assert.ok(!redigido.email_relay_token.includes('secreto'))
  assert.equal(SECRET_SETTING_KEYS.includes('email_relay_token'), true)
})

test('redactSettings esconde toda a mensageria de agente nao-admin', () => {
  const redigido = redactSettings(SETTINGS_DE_EXEMPLO, { isAdmin: false })

  assert.equal(redigido.clinic_name, 'Clinica X')
  for (const chave of ['email_enabled', 'email_relay_url', 'email_relay_token', 'email_from_name']) {
    assert.equal(chave in redigido, false, `${chave} nao pode chegar em agente comum`)
  }
})

test('redactSettings sem opcoes trata como nao-admin', () => {
  // Default seguro: quem esquecer de passar o papel nao vaza mensageria.
  const redigido = redactSettings(SETTINGS_DE_EXEMPLO)

  assert.equal('email_relay_url' in redigido, false)
})

test('resolveEmailConfig da prioridade ao que foi salvo no painel', async () => {
  const config = await resolveEmailConfig({
    DB: fakeDb([
      { key: 'email_relay_url', value: 'https://do-painel/exec' },
      { key: 'email_relay_token', value: 'token-do-painel' },
      { key: 'email_from_name', value: 'Clinica X' },
    ]),
    EMAIL_RELAY_URL: 'https://do-env/exec',
    EMAIL_RELAY_TOKEN: 'token-do-env',
  })

  assert.equal(config.url, 'https://do-painel/exec')
  assert.equal(config.token, 'token-do-painel')
  assert.equal(config.fromName, 'Clinica X')
  assert.equal(config.enabled, true)
})

test('resolveEmailConfig cai pro env quando o painel nao tem nada salvo', async () => {
  const config = await resolveEmailConfig({
    DB: fakeDb([]),
    EMAIL_RELAY_URL: 'https://do-env/exec',
    EMAIL_RELAY_TOKEN: 'token-do-env',
  })

  assert.equal(config.url, 'https://do-env/exec')
  assert.equal(config.token, 'token-do-env')
  assert.equal(config.fromName, 'CareDesk')
})

test('resolveEmailConfig so desliga o envio com o valor explicito 0', async () => {
  const desligado = await resolveEmailConfig({
    DB: fakeDb([{ key: 'email_enabled', value: '0' }]),
  })
  const semConfigurar = await resolveEmailConfig({ DB: fakeDb([]) })

  assert.equal(desligado.enabled, false)
  assert.equal(semConfigurar.enabled, true)
})
