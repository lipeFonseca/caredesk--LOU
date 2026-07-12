import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROTOCOL_DAY_SOURCES,
  attachResolvedProtocol,
  calcProtocolUrgency,
  resolvePatientProtocol,
} from '../src/utils/protocols.js'

test('resolvePatientProtocol prefers linked protocol days', () => {
  const resolution = resolvePatientProtocol(
    {
      protocol_id: 'proto-linked',
      protocol_days_json: '[0,5,10]',
      protocol_name: 'Ligado',
    },
    {
      defaultProtocol: { id: 'proto-default', name: 'Padrao', days: [1, 2, 3] },
      globalProtocolDays: [9, 10, 11],
    }
  )

  assert.deepEqual(resolution.days, [0, 5, 10])
  assert.equal(resolution.source, PROTOCOL_DAY_SOURCES.LINKED)
  assert.equal(resolution.protocolId, 'proto-linked')
})

test('resolvePatientProtocol falls back to default protocol before global setting', () => {
  const resolution = resolvePatientProtocol(
    {
      protocol_id: null,
      protocol_days: '7,15,30',
    },
    {
      defaultProtocol: {
        id: 'proto-default',
        name: 'Padrao',
        days: [0, 2, 5],
      },
      globalProtocolDays: [9, 10, 11],
    }
  )

  assert.deepEqual(resolution.days, [0, 2, 5])
  assert.equal(resolution.source, PROTOCOL_DAY_SOURCES.DEFAULT)
  assert.equal(resolution.protocolId, 'proto-default')
})

test('resolvePatientProtocol uses global setting when there is no linked or default protocol', () => {
  const resolution = resolvePatientProtocol(
    {
      protocol_id: null,
      protocol_days: '',
    },
    {
      defaultProtocol: null,
      globalProtocolDays: [2, 8, 20],
    }
  )

  assert.deepEqual(resolution.days, [2, 8, 20])
  assert.equal(resolution.source, PROTOCOL_DAY_SOURCES.GLOBAL)
})

test('resolvePatientProtocol keeps legacy patient days only as final compatibility fallback', () => {
  const resolution = resolvePatientProtocol(
    {
      protocol_id: null,
      protocol_days: '30,7,15',
    },
    {
      defaultProtocol: null,
      globalProtocolDays: [],
    }
  )

  assert.deepEqual(resolution.days, [7, 15, 30])
  assert.equal(resolution.source, PROTOCOL_DAY_SOURCES.LEGACY)
})

test('attachResolvedProtocol exposes stable resolved_* fields for the frontend', () => {
  const patient = attachResolvedProtocol(
    { id: 'patient-1', name: 'Paciente', status: 'active' },
    {
      days: [0, 10],
      source: PROTOCOL_DAY_SOURCES.DEFAULT,
      protocolId: 'proto-default',
      protocolName: 'Padrao',
      protocolDescription: null,
      protocolColor: '#123456',
      protocolIsCustom: 0,
    }
  )

  assert.deepEqual(patient.protocol_days_parsed, [0, 10])
  assert.equal(patient.protocol_days_source, PROTOCOL_DAY_SOURCES.DEFAULT)
  assert.equal(patient.resolved_protocol_id, 'proto-default')
  assert.equal(patient.resolved_protocol_name, 'Padrao')
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
