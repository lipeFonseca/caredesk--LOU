export const DOCUMENT_CATEGORIES = Object.freeze(['send', 'request'])
export const DOCUMENT_STATUSES = Object.freeze(['pending', 'done'])

export function isValidDocumentCategory(value) {
  return DOCUMENT_CATEGORIES.includes(value)
}

export function isValidDocumentStatus(value) {
  return DOCUMENT_STATUSES.includes(value)
}

export function validateDocumentTemplatePayload(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''

  if (!name) return { error: 'Informe o nome do documento', status: 400 }
  if (!isValidDocumentCategory(category)) {
    return { error: 'Categoria inválida. Use "send" ou "request"', status: 400 }
  }

  return {
    name,
    category,
    description: description || null,
  }
}
