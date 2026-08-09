import test from 'node:test'
import assert from 'node:assert/strict'
import { criarFakeD1 } from './helpers/fakeD1.js'
import {
  MESSAGE_TEMPLATE_PLACEHOLDERS,
  renderMessageTemplate,
  resolveSuggestedMessageTemplate,
} from '../src/utils/messageTemplates.js'

test('MESSAGE_TEMPLATE_PLACEHOLDERS inclui o nome do responsável', () => {
  assert.ok(MESSAGE_TEMPLATE_PLACEHOLDERS.some((p) => p.key === 'responsavel_name'))
})

test('renderMessageTemplate substitui {{responsavel_name}} pelo valor do contexto', () => {
  const texto = renderMessageTemplate('Olá {{responsavel_name}}, tudo bem?', { responsavel_name: 'Maria' })
  assert.equal(texto, 'Olá Maria, tudo bem?')
})

test('resolveSuggestedMessageTemplate renderiza o responsável do paciente no template sugerido', async () => {
  const db = criarFakeD1([
    {
      match: 'FROM protocol_message_templates',
      results: [{
        id: 'tpl-1', protocol_id: 'proto-1', day_offset: 0,
        title: 'Boas-vindas', content: 'Olá {{responsavel_name}}, o contato é sobre {{patient_name}}.',
        contact_type: 'whatsapp',
      }],
    },
  ])

  const patient = {
    name: 'João Paciente', phone: '85999999999', responsavel: 'Maria Responsável',
    procedure: 'Rinoplastia', surgery_date: '2026-08-09', agent_name: 'Louanda',
  }
  const resolution = { protocolId: 'proto-1', protocolName: 'Padrão', days: [0, 7] }

  const { templates } = await resolveSuggestedMessageTemplate(db, patient, resolution, 0, 'CareDesk')

  assert.equal(templates.length, 1)
  assert.equal(templates[0].rendered_content, 'Olá Maria Responsável, o contato é sobre João Paciente.')
})
