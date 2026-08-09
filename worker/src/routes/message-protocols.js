import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  isValidMessageTemplateContactType,
  MESSAGE_TEMPLATE_PLACEHOLDERS,
} from '../utils/messageTemplates.js'
import { parseProtocolDays } from '../utils/protocols.js'

const messageProtocols = new Hono()
messageProtocols.use('*', authMiddleware)

messageProtocols.get('/', async (c) => {
  const protocolId = c.req.query('protocol_id')
  const where = protocolId ? 'WHERE m.protocol_id = ?' : ''
  const query = `
    SELECT
      m.*,
      p.name AS protocol_name,
      p.color AS protocol_color,
      p.days AS protocol_days
    FROM protocol_message_templates m
    INNER JOIN contact_protocols p ON p.id = m.protocol_id
    ${where}
    ORDER BY p.is_default DESC, p.created_at ASC, m.day_offset ASC, m.created_at ASC
  `
  const statement = c.env.DB.prepare(query)
  const runner = protocolId ? statement.bind(protocolId) : statement
  const { results } = await runner.all()

  return c.json(results.map((row) => ({
    ...row,
    protocol_days: parseProtocolDays(row.protocol_days),
  })))
})

messageProtocols.get('/placeholders', adminOnly, (c) => {
  return c.json(MESSAGE_TEMPLATE_PLACEHOLDERS)
})

messageProtocols.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT
      m.*,
      p.name AS protocol_name,
      p.color AS protocol_color,
      p.days AS protocol_days
    FROM protocol_message_templates m
    INNER JOIN contact_protocols p ON p.id = m.protocol_id
    WHERE m.id = ?
    LIMIT 1
  `).bind(c.req.param('id')).first()

  if (!row) return c.json({ error: 'Protocolo de mensagens não encontrado' }, 404)

  return c.json({
    ...row,
    protocol_days: parseProtocolDays(row.protocol_days),
  })
})

messageProtocols.post('/', adminOnly, async (c) => {
  const body = await c.req.json()
  const validation = await validateTemplatePayload(c.env.DB, body)
  if (validation.error) return c.json({ error: validation.error }, validation.status)

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO protocol_message_templates (id, protocol_id, day_offset, title, content, contact_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    validation.protocol.id,
    validation.dayOffset,
    validation.title,
    validation.content,
    validation.contactType
  ).run()

  return c.json({
    id,
    protocol_id: validation.protocol.id,
    protocol_name: validation.protocol.name,
    protocol_color: validation.protocol.color,
    protocol_days: validation.protocol.days,
    day_offset: validation.dayOffset,
    title: validation.title,
    content: validation.content,
    contact_type: validation.contactType,
  }, 201)
})

messageProtocols.patch('/:id', adminOnly, async (c) => {
  const existing = await c.env.DB.prepare(`
    SELECT id, protocol_id, day_offset, title, content, contact_type
    FROM protocol_message_templates
    WHERE id = ?
    LIMIT 1
  `).bind(c.req.param('id')).first()

  if (!existing) return c.json({ error: 'Protocolo de mensagens não encontrado' }, 404)

  const body = await c.req.json()
  const mergedBody = {
    protocol_id: body.protocol_id ?? existing.protocol_id,
    day_offset: 'day_offset' in body ? body.day_offset : existing.day_offset,
    title: body.title ?? existing.title,
    content: body.content ?? existing.content,
    contact_type: body.contact_type ?? existing.contact_type,
  }

  const validation = await validateTemplatePayload(c.env.DB, mergedBody)
  if (validation.error) return c.json({ error: validation.error }, validation.status)

  await c.env.DB.prepare(`
    UPDATE protocol_message_templates
    SET protocol_id = ?, day_offset = ?, title = ?, content = ?, contact_type = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    validation.protocol.id,
    validation.dayOffset,
    validation.title,
    validation.content,
    validation.contactType,
    existing.id
  ).run()

  return c.json({
    id: existing.id,
    protocol_id: validation.protocol.id,
    protocol_name: validation.protocol.name,
    protocol_color: validation.protocol.color,
    protocol_days: validation.protocol.days,
    day_offset: validation.dayOffset,
    title: validation.title,
    content: validation.content,
    contact_type: validation.contactType,
  })
})

messageProtocols.delete('/:id', adminOnly, async (c) => {
  await c.env.DB.prepare('DELETE FROM protocol_message_templates WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

export default messageProtocols

async function validateTemplatePayload(db, body) {
  const protocolId = typeof body.protocol_id === 'string' ? body.protocol_id.trim() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const dayOffset = Number(body.day_offset)
  const contactType = typeof body.contact_type === 'string'
    ? body.contact_type.trim()
    : 'whatsapp'

  if (!protocolId) return { error: 'Selecione um protocolo de contato', status: 400 }
  if (!title) return { error: 'Informe o nome da mensagem', status: 400 }
  if (!content) return { error: 'Informe o texto da mensagem', status: 400 }
  if (Number.isNaN(dayOffset)) return { error: 'Selecione um marco válido do protocolo', status: 400 }
  if (!isValidMessageTemplateContactType(contactType)) {
    return { error: 'Tipo de contato inválido para a mensagem', status: 400 }
  }

  const protocol = await db.prepare(`
    SELECT id, name, color, days
    FROM contact_protocols
    WHERE id = ?
    LIMIT 1
  `).bind(protocolId).first()

  if (!protocol) return { error: 'Protocolo de contato não encontrado', status: 404 }

  const protocolDays = parseProtocolDays(protocol.days)
  if (!protocolDays.includes(dayOffset)) {
    return { error: 'O marco escolhido não pertence ao protocolo selecionado', status: 400 }
  }

  // Mais de uma mensagem por marco e permitido de proposito — variar o texto
  // entre pacientes evita padrao de banimento de numero no WhatsApp. Ver 0025.

  return {
    protocol: {
      ...protocol,
      days: protocolDays,
    },
    title,
    content,
    dayOffset,
    contactType,
  }
}
