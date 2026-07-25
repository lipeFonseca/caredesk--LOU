import { Hono } from 'hono'
import { recalcularPorProtocolo } from '../utils/proximoMarco.js'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const protocols = new Hono()
protocols.use('*', authMiddleware)

// GET /api/protocols  (custom=1 para incluir protocolos personalizados de pacientes)
protocols.get('/', async (c) => {
  const includeCustom = c.req.query('custom') === '1'
  const where = includeCustom ? '' : 'WHERE p.is_custom = 0'
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM patients WHERE protocol_id = p.id) AS patient_count
     FROM contact_protocols p ${where} ORDER BY p.is_default DESC, p.created_at ASC`
  ).all()
  return c.json(results.map(r => ({ ...r, days: JSON.parse(r.days) })))
})

// GET /api/protocols/:id
protocols.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM contact_protocols WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return c.json({ error: 'Protocolo não encontrado' }, 404)
  return c.json({ ...row, days: JSON.parse(row.days) })
})

// POST /api/protocols (admin only)
protocols.post('/', adminOnly, async (c) => {
  const body = await c.req.json()
  const {
    name,
    description,
    days,
    color,
    is_default,
    is_custom,
  } = body
  if (!name?.trim()) return c.json({ error: 'Nome é obrigatório' }, 400)
  if (!Array.isArray(days))   return c.json({ error: 'days deve ser um array' }, 400)

  const sorted = [...new Set(days.map(Number))].filter(n => !isNaN(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return c.json({ error: 'Adicione ao menos um marco no protocolo' }, 400)
  const id = crypto.randomUUID()

  if (is_default && !is_custom) {
    await c.env.DB.prepare('UPDATE contact_protocols SET is_default = 0').run()
  }

  await c.env.DB.prepare(`
    INSERT INTO contact_protocols (id, name, description, days, color, is_default, is_custom)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    name.trim(),
    description || null,
    JSON.stringify(sorted),
    color || '#6366f1',
    is_default ? 1 : 0,
    is_custom ? 1 : 0
  ).run()

  return c.json({
    id,
    name: name.trim(),
    description: description || null,
    days: sorted,
    color: color || '#6366f1',
    is_default: is_default ? 1 : 0,
    is_custom: is_custom ? 1 : 0,
    patient_count: 0,
  }, 201)
})

// PATCH /api/protocols/:id (admin only)
protocols.patch('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM contact_protocols WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Protocolo não encontrado' }, 404)

  const body = await c.req.json()
  const name        = body.name?.trim()        ?? existing.name
  const description = 'description' in body ? (body.description || null) : existing.description
  const color       = body.color               ?? existing.color
  const is_default  = 'is_default' in body ? (body.is_default ? 1 : 0) : existing.is_default
  const days        = Array.isArray(body.days)
    ? JSON.stringify([...new Set(body.days.map(Number))].filter(n => !isNaN(n)).sort((a, b) => a - b))
    : existing.days
  if (Array.isArray(body.days) && JSON.parse(days).length === 0) {
    return c.json({ error: 'Adicione ao menos um marco no protocolo' }, 400)
  }

  if (is_default) {
    await c.env.DB.prepare('UPDATE contact_protocols SET is_default = 0 WHERE id != ?').bind(id).run()
  }

  await c.env.DB.prepare(`
    UPDATE contact_protocols SET name = ?, description = ?, days = ?, color = ?, is_default = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(name, description, days, color, is_default, id).run()

  // Mudar os dias reposiciona o proximo marco de TODOS os pacientes vinculados.
  // Unico ponto do sistema onde uma edicao afeta muitas linhas de uma vez — por
  // isso o recalculo aqui e em lote, nao por paciente.
  if (Array.isArray(body.days) && days !== existing.days) {
    await recalcularPorProtocolo(c.env.DB, id)
  }

  return c.json({
    id,
    name,
    description,
    days: JSON.parse(days),
    color,
    is_default,
  })
})

// DELETE /api/protocols/:id (admin only)
protocols.delete('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const usage = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM patients WHERE protocol_id = ?').bind(id).first()
  if (usage?.count > 0) {
    return c.json({ error: `Protocolo em uso por ${usage.count} paciente(s). Altere o protocolo deles antes de excluir.` }, 409)
  }
  await c.env.DB.prepare('DELETE FROM contact_protocols WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default protocols
