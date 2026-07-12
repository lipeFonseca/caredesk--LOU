import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  attachResolvedProtocol,
  calcProtocolUrgency,
  getProtocolResolutionContext,
  resolvePatientProtocol,
} from '../utils/protocols.js'

const patients = new Hono()
patients.use('*', authMiddleware)

// ── GET /api/patients ─────────────────────────────────────────
patients.get('/', async (c) => {
  const { status, agent_id, from, to, search } = c.req.query()

  let sql = `
    SELECT
      p.*,
      a.name  AS agent_name,
      cp.name AS protocol_name,
      cp.days AS _proto_days,
      cp.color AS protocol_color,
      (SELECT contact_date FROM followup_logs WHERE patient_id = p.id ORDER BY contact_date DESC LIMIT 1) AS last_contact_date,
      (SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id AND is_extra_contact = 0) AS total_followups
    FROM patients p
    LEFT JOIN agents a           ON p.assigned_agent_id = a.id
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE 1=1
  `
  const binds = []

  if (status)   { sql += ' AND p.status = ?';            binds.push(status) }
  if (agent_id) { sql += ' AND p.assigned_agent_id = ?'; binds.push(agent_id) }
  if (from)     { sql += ' AND p.surgery_date >= ?';     binds.push(from) }
  if (to)       { sql += ' AND p.surgery_date <= ?';     binds.push(to) }
  if (search)   {
    sql += ' AND (p.name LIKE ? OR p.phone LIKE ?)'
    const like = `%${search}%`
    binds.push(like, like)
  }
  sql += ' ORDER BY p.surgery_date DESC'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  const protocolContext = await getProtocolResolutionContext(c.env.DB)

  const today = new Date().toISOString().split('T')[0]
  const enriched = results.map(p => {
    const resolution = resolvePatientProtocol(p, protocolContext)
    const { _proto_days, ...rest } = p
    const withProtocol = attachResolvedProtocol(rest, resolution)
    return {
      ...withProtocol,
      followup_urgency: calcProtocolUrgency(withProtocol, resolution.days, today),
    }
  })

  return c.json(enriched)
})

// ── GET /api/patients/:id ─────────────────────────────────────
patients.get('/:id', async (c) => {
  const patient = await c.env.DB.prepare(`
    SELECT p.*, a.name AS agent_name,
           cp.name AS protocol_name, cp.days AS protocol_days_json,
           cp.color AS protocol_color, cp.description AS protocol_description,
           cp.is_custom AS protocol_is_custom
    FROM patients p
    LEFT JOIN agents a           ON p.assigned_agent_id = a.id
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE p.id = ?
  `).bind(c.req.param('id')).first()

  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const { results: logs } = await c.env.DB.prepare(`
    SELECT fl.*, a.name AS agent_name
    FROM followup_logs fl
    LEFT JOIN agents a ON fl.agent_id = a.id
    WHERE fl.patient_id = ?
    ORDER BY fl.contact_date DESC
  `).bind(patient.id).all()

  const protocolContext = await getProtocolResolutionContext(c.env.DB)
  const resolution = resolvePatientProtocol(patient, protocolContext)
  const patientOut = attachResolvedProtocol(patient, resolution)
  const today = new Date().toISOString().split('T')[0]

  return c.json({
    ...patientOut,
    followup_urgency: calcProtocolUrgency(
      {
        ...patientOut,
        total_followups: logs.filter((log) => !log.is_extra_contact).length,
      },
      resolution.days,
      today
    ),
    followup_logs: logs,
  })
})

// ── POST /api/patients ────────────────────────────────────────
patients.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name, phone, procedure, surgery_date, assigned_agent_id, protocol_id, notes } = body

    if (!name || !procedure || !surgery_date) {
      return c.json({ error: 'Nome, procedimento e data da cirurgia são obrigatórios' }, 400)
    }

    const resolvedProtocolId = await resolveWritableProtocolId(c.env.DB, protocol_id)
    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO patients (id, name, phone, procedure, surgery_date, assigned_agent_id, protocol_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name,
      phone             || null,
      procedure,
      surgery_date,
      assigned_agent_id || null,
      resolvedProtocolId,
      notes             || null
    ).run()

    return c.json({
      id, name,
      phone:             phone             || null,
      procedure,
      surgery_date,
      assigned_agent_id: assigned_agent_id || null,
      protocol_id:       resolvedProtocolId,
      notes:             notes             || null,
      status:            'active',
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }, 201)
  } catch (error) {
    return writeProtocolError(c, error)
  }
})

// ── PATCH /api/patients/:id ───────────────────────────────────
patients.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const allowed = ['name','phone','procedure','surgery_date','assigned_agent_id','protocol_id','status','notes']
    const fields = Object.keys(body).filter(k => allowed.includes(k))
    if (!fields.length) return c.json({ error: 'Nenhum campo válido enviado' }, 400)

    const sets = fields.map(f => `${f} = ?`).join(', ')
    const nullable = ['phone', 'assigned_agent_id', 'protocol_id', 'notes']
    const values = await Promise.all(fields.map(async (field) => {
      if (field === 'protocol_id') {
        return resolveWritableProtocolId(c.env.DB, body[field])
      }

      if (nullable.includes(field) && body[field] === '') return null
      return body[field]
    }))

    await c.env.DB.prepare(
      `UPDATE patients SET ${sets}, updated_at = datetime('now') WHERE id = ?`
    ).bind(...values, id).run()

    const updated = await c.env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(id).first()
    return c.json(updated)
  } catch (error) {
    return writeProtocolError(c, error)
  }
})

// ── DELETE /api/patients/:id (admin only) ─────────────────────
patients.delete('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')

  // Verificar se paciente tem protocolo customizado (is_custom=1) para limpar depois
  const row = await c.env.DB.prepare(
    `SELECT p.protocol_id, cp.is_custom
     FROM patients p
     LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
     WHERE p.id = ?`
  ).bind(id).first()

  // Deletar paciente — cascades: followup_logs, notifications
  await c.env.DB.prepare('DELETE FROM patients WHERE id = ?').bind(id).run()

  // Limpar protocolo customizado orphan (só existe para esse paciente)
  if (row?.protocol_id && row?.is_custom === 1) {
    await c.env.DB.prepare('DELETE FROM contact_protocols WHERE id = ? AND is_custom = 1').bind(row.protocol_id).run()
  }

  return c.json({ success: true })
})
export default patients

async function resolveWritableProtocolId(db, requestedProtocolId) {
  const normalized = typeof requestedProtocolId === 'string'
    ? requestedProtocolId.trim()
    : requestedProtocolId

  if (normalized) {
    const protocol = await db.prepare('SELECT id FROM contact_protocols WHERE id = ? LIMIT 1').bind(normalized).first()
    if (!protocol) {
      const error = new Error('PROTOCOL_NOT_FOUND')
      error.status = 400
      throw error
    }
    return protocol.id
  }

  const fallback = await db.prepare(`
    SELECT id
    FROM contact_protocols
    WHERE is_default = 1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).first()

  return fallback?.id || null
}

function writeProtocolError(c, error) {
  if (error?.message === 'PROTOCOL_NOT_FOUND') {
    return c.json({ error: 'Protocolo informado não existe' }, error.status || 400)
  }

  throw error
}
