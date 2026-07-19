import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROTOCOL_DAY_SOURCES,
  attachResolvedProtocol,
  calcProtocolUrgency,
  resolvePatientProtocol,
} from '../src/utils/protocols.js'

test('resolvePatientProtocol prefers linked protocol days', () => {
  const resolution = resolvePatientProtocol({
    protocol_id: 'proto-linked',
    protocol_days_json: '[0,5,10]',
    protocol_name: 'Ligado',
  })

  assert.deepEqual(resolution.days, [0, 5, 10])
  assert.equal(resolution.source, PROTOCOL_DAY_SOURCES.LINKED)
  assert.equal(resolution.protocolId, 'proto-linked')
})

test('resolvePatientProtocol falls back to EMPTY when patient has no protocol linked', () => {
  const resolution = resolvePatientProtocol({ protocol_id: null })

  assert.deepEqual(resolution.days, [])
  assert.equal(resolution.source, PROTOCOL_DAY_SOURCES.EMPTY)
})

test('attachResolvedProtocol exposes stable resolved_* fields for the frontend', () => {
  const patient = attachResolvedProtocol(
    { id: 'patient-1', name: 'Paciente', status: 'active' },
    {
      days: [0, 10],
      source: PROTOCOL_DAY_SOURCES.LINKED,
      protocolId: 'proto-linked',
      protocolName: 'Ligado',
      protocolDescription: null,
      protocolColor: '#123456',
      protocolIsCustom: 0,
    }
  )

  assert.deepEqual(patient.protocol_days_parsed, [0, 10])
  assert.equal(patient.protocol_days_source, PROTOCOL_DAY_SOURCES.LINKED)
  assert.equal(patient.resolved_protocol_id, 'proto-linked')
  assert.equal(patient.resolved_protocol_name, 'Ligado')
  assert.equal(patient.resolved_protocol_color, '#123456')
})

test('calcProtocolUrgency respects the resolved protocol days', () => {
  const urgency = calcProtocolUrgency(
    {
      status: 'active',
      surgery_date: '2026-07-01',
      total_followups: 0,
    },
    [0, 7, 15],
    '2026-07-11'
  )

  assert.equal(urgency, 'overdue')
})
