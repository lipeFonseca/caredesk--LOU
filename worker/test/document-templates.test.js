import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isValidDocumentCategory,
  isValidDocumentStatus,
  validateDocumentTemplatePayload,
} from '../src/utils/documentTemplates.js'

test('isValidDocumentCategory accepts only send/request', () => {
  assert.equal(isValidDocumentCategory('send'), true)
  assert.equal(isValidDocumentCategory('request'), true)
  assert.equal(isValidDocumentCategory('enviar'), false)
  assert.equal(isValidDocumentCategory(''), false)
})

test('isValidDocumentStatus accepts only pending/done', () => {
  assert.equal(isValidDocumentStatus('pending'), true)
  assert.equal(isValidDocumentStatus('done'), true)
  assert.equal(isValidDocumentStatus('sent'), false)
})

test('validateDocumentTemplatePayload requires a non-empty name', () => {
  const result = validateDocumentTemplatePayload({ name: '   ', category: 'send' })
  assert.equal(result.error, 'Informe o nome do documento')
  assert.equal(result.status, 400)
})

test('validateDocumentTemplatePayload rejects invalid category', () => {
  const result = validateDocumentTemplatePayload({ name: 'RG', category: 'enviar' })
  assert.equal(result.status, 400)
})

test('validateDocumentTemplatePayload trims name/description and passes through valid category', () => {
  const result = validateDocumentTemplatePayload({
    name: '  RG  ',
    category: 'request',
    description: '  frente e verso  ',
  })
  assert.deepEqual(result, { name: 'RG', category: 'request', description: 'frente e verso' })
})

test('validateDocumentTemplatePayload defaults empty description to null', () => {
  const result = validateDocumentTemplatePayload({ name: 'Termo', category: 'send' })
  assert.equal(result.description, null)
})
