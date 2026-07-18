import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { validateDocumentTemplatePayload } from '../utils/documentTemplates.js'

const documentTemplates = new Hono()
documentTemplates.use('*', authMiddleware)

// GET /api/document-templates (?category=send|request)
documentTemplates.get('/', async (c) => {
  const category = c.req.query('category')
  const where = category ? 'WHERE dt.category = ?' : ''
  const statement = c.env.DB.prepare(`
    SELECT dt.*, (SELECT COUNT(*) FROM patient_documents WHERE document_template_id = dt.id) AS patient_count
    FROM document_templates dt
    ${where}
    ORDER BY dt.category ASC, dt.created_at ASC
  `)
  const runner = category ? statement.bind(category) : statement
  const { results } = await runner.all()
  return c.json(results)
})

// GET /api/document-templates/:id
documentTemplates.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM document_templates WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return c.json({ error: 'Documento não encontrado' }, 404)
  return c.json(row)
})

// POST /api/document-templates (admin only)
documentTemplates.post('/', adminOnly, async (c) => {
  const body = await c.req.json()
  const validation = validateDocumentTemplatePayload(body)
  if (validation.error) return c.json({ error: validation.error }, validation.status)

  const id = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO document_templates (id, name, category, description)
    VALUES (?, ?, ?, ?)
  `).bind(id, validation.name, validation.category, validation.description).run()

  return c.json({
    id,
    name: validation.name,
    category: validation.category,
    description: validation.description,
    patient_count: 0,
  }, 201)
})

// PATCH /api/document-templates/:id (admin only)
documentTemplates.patch('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM document_templates WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Documento não encontrado' }, 404)

  const body = await c.req.json()
  const validation = validateDocumentTemplatePayload({
    name: body.name ?? existing.name,
    category: body.category ?? existing.category,
    description: 'description' in body ? body.description : existing.description,
  })
  if (validation.error) return c.json({ error: validation.error }, validation.status)

  await c.env.DB.prepare(`
    UPDATE document_templates SET name = ?, category = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(validation.name, validation.category, validation.description, id).run()

  return c.json({
    id,
    name: validation.name,
    category: validation.category,
    description: validation.description,
  })
})

// DELETE /api/document-templates/:id (admin only)
documentTemplates.delete('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const usage = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM patient_documents WHERE document_template_id = ?').bind(id).first()
  if (usage?.count > 0) {
    return c.json({ error: `Documento em uso por ${usage.count} paciente(s). Remova a atribuição desses pacientes antes de excluir.` }, 409)
  }
  await c.env.DB.prepare('DELETE FROM document_templates WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default documentTemplates
