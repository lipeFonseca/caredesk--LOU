import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  attachResolvedProtocol,
  calcProtocolUrgency,
  getProtocolResolutionContext,
  resolvePatientProtocol,
} from '../utils/protocols.js'
import { resolveSuggestedMessageTemplate } from '../utils/messageTemplates.js'
import { isValidDocumentStatus } from '../utils/documentTemplates.js'

const patients = new Hono()
patients.use('*', authMiddleware)

// ── GET /api/patients ─────────────────────────────────────────
// `page` e opcional: quando ausente, mantem o comportamento historico de
// retornar todos os registros que casam com o filtro (usado hoje pelo
// Dashboard, que precisa da base ativa inteira pra calcular KPIs). Quando
// presente, aplica LIMIT/OFFSET e a resposta inclui `total` pra paginacao
// no frontend.
patients.get('/', async (c) => {
  const { status, agent_id, from, to, search, page, limit } = c.req.query()

  let whereSql = ' WHERE 1=1'
  const binds = []

  if (status)   { whereSql += ' AND p.status = ?';            binds.push(status) }
  if (agent_id) { whereSql += ' AND p.assigned_agent_id = ?'; binds.push(agent_id) }
  if (from)     { whereSql += ' AND p.surgery_date >= ?';     binds.push(from) }
  if (to)       { whereSql += ' AND p.surgery_date <= ?';     binds.push(to) }
  if (search)   {
    whereSql += ' AND (p.name LIKE ? OR p.phone LIKE ?)'
    const like = `%${search}%`
    binds.push(like, like)
  }

  const countRow = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total FROM patients p ${whereSql}
  `).bind(...binds).first()
  const total = countRow?.total ?? 0

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
    ${whereSql}
    ORDER BY p.surgery_date DESC
  `
  const queryBinds = [...binds]

  const pageNum = parseInt(page, 10)
  if (Number.isInteger(pageNum) && pageNum > 0) {
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    sql += ' LIMIT ? OFFSET ?'
    queryBinds.push(limitNum, (pageNum - 1) * limitNum)
  }

  const { results } = await c.env.DB.prepare(sql).bind(...queryBinds).all()
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

  return c.json({ patients: enriched, total })
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
  const completedCount = logs.filter((log) => !log.is_extra_contact).length
  const clinicSetting = await c.env.DB.prepare(`
    SELECT value
    FROM app_settings
    WHERE key = 'clinic_name'
    LIMIT 1
  `).first()
  const suggestedMessage = await resolveSuggestedMessageTemplate(
    c.env.DB,
    patientOut,
    resolution,
    completedCount,
    clinicSetting?.value || 'CareDesk'
  )

  return c.json({
    ...patientOut,
    followup_urgency: calcProtocolUrgency(
      {
        ...patientOut,
        total_followups: completedCount,
      },
      resolution.days,
      today
    ),
    next_protocol_step: suggestedMessage.nextMilestone
      ? {
          day_offset: suggestedMessage.nextMilestone.day,
          date: suggestedMessage.nextMilestone.dateStr,
        }
      : null,
    suggested_message_template: suggestedMessage.template,
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

// ── GET /api/patients/:id/documents ───────────────────────────
// Catálogo inteiro com LEFT JOIN na atribuição desse paciente, pra a UI
// renderizar o checklist completo (marcado/desmarcado + status) numa
// unica chamada.
patients.get('/:id/documents', async (c) => {
  const patientId = c.req.param('id')
  const patient = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ?').bind(patientId).first()
  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const { results } = await c.env.DB.prepare(`
    SELECT dt.id AS document_template_id, dt.name, dt.category, dt.description, pd.status
    FROM document_templates dt
    LEFT JOIN patient_documents pd
      ON pd.document_template_id = dt.id AND pd.patient_id = ?
    ORDER BY dt.category ASC, dt.created_at ASC
  `).bind(patientId).all()

  return c.json(results.map((row) => ({
    document_template_id: row.document_template_id,
    name: row.name,
    category: row.category,
    description: row.description,
    assigned: row.status !== null,
    status: row.status,
  })))
})

// ── PUT /api/patients/:id/documents/:templateId ───────────────
// Atribui (marca a caixa). Upsert idempotente — marcar de novo so atualiza.
patients.put('/:id/documents/:templateId', async (c) => {
  const patientId = c.req.param('id')
  const templateId = c.req.param('templateId')

  const patient = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ?').bind(patientId).first()
  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const template = await c.env.DB.prepare('SELECT id FROM document_templates WHERE id = ?').bind(templateId).first()
  if (!template) return c.json({ error: 'Documento não encontrado' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const status = isValidDocumentStatus(body.status) ? body.status : 'pending'

  await c.env.DB.prepare(`
    INSERT INTO patient_documents (id, patient_id, document_template_id, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(patient_id, document_template_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')
  `).bind(crypto.randomUUID(), patientId, templateId, status).run()

  return c.json({ document_template_id: templateId, assigned: true, status })
})

// ── PATCH /api/patients/:id/documents/:templateId ─────────────
// So alterna o status (pendente/feito) de um documento ja atribuido.
patients.patch('/:id/documents/:templateId', async (c) => {
  const patientId = c.req.param('id')
  const templateId = c.req.param('templateId')
  const body = await c.req.json()

  if (!isValidDocumentStatus(body.status)) {
    return c.json({ error: 'Status inválido. Use "pending" ou "done"' }, 400)
  }

  const result = await c.env.DB.prepare(`
    UPDATE patient_documents SET status = ?, updated_at = datetime('now')
    WHERE patient_id = ? AND document_template_id = ?
  `).bind(body.status, patientId, templateId).run()

  if (!result.meta.changes) return c.json({ error: 'Documento não atribuído a este paciente' }, 404)

  return c.json({ document_template_id: templateId, assigned: true, status: body.status })
})

// ── DELETE /api/patients/:id/documents/:templateId ────────────
// Desatribui (desmarca a caixa).
patients.delete('/:id/documents/:templateId', async (c) => {
  const patientId = c.req.param('id')
  const templateId = c.req.param('templateId')

  await c.env.DB.prepare(
    'DELETE FROM patient_documents WHERE patient_id = ? AND document_template_id = ?'
  ).bind(patientId, templateId).run()

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
