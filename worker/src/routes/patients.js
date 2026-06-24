import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const patients = new Hono()
patients.use('*', authMiddleware)

// ── GET /api/patients ─────────────────────────────────────────
// Query params: status, agent_id, from, to, search
patients.get('/', async (c) => {
  const { status, agent_id, from, to, search } = c.req.query()

  let sql = `
    SELECT
      p.*,
      a.name AS agent_name,
      (
        SELECT contact_date FROM followup_logs
        WHERE patient_id = p.id
        ORDER BY contact_date DESC LIMIT 1
      ) AS last_contact_date,
      (
        SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id
      ) AS total_followups
    FROM patients p
    LEFT JOIN agents a ON p.assigned_agent_id = a.id
    WHERE 1=1
  `
  const binds = []

  if (status)   { sql += ' AND p.status = ?';           binds.push(status) }
  if (agent_id) { sql += ' AND p.assigned_agent_id = ?'; binds.push(agent_id) }
  if (from)     { sql += ' AND p.surgery_date >= ?';    binds.push(from) }
  if (to)       { sql += ' AND p.surgery_date <= ?';    binds.push(to) }
  if (search)   {
    sql += ' AND (p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)'
    const like = `%${search}%`
    binds.push(like, like, like)
  }

  sql += ' ORDER BY p.surgery_date DESC'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()

  // Calcular status de urgência de follow-up para cada paciente
  const today = new Date().toISOString().split('T')[0]
  const enriched = results.map(p => ({
    ...p,
    followup_urgency: calcUrgency(p, today)
  }))

  return c.json(enriched)
})

// ── GET /api/patients/:id ─────────────────────────────────────
patients.get('/:id', async (c) => {
  const patient = await c.env.DB.prepare(`
    SELECT p.*, a.name AS agent_name
    FROM patients p
    LEFT JOIN agents a ON p.assigned_agent_id = a.id
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

  return c.json({ ...patient, followup_logs: logs })
})

// ── POST /api/patients ────────────────────────────────────────
patients.post('/', async (c) => {
  const body = await c.req.json()
  const { name, phone, email, procedure, surgery_date, assigned_agent_id, protocol_days, notes } = body

  if (!name || !procedure || !surgery_date) {
    return c.json({ error: 'Nome, procedimento e data da cirurgia são obrigatórios' }, 400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO patients (id, name, phone, email, procedure, surgery_date, assigned_agent_id, protocol_days, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    name,
    phone             || null,
    email             || null,
    procedure,
    surgery_date,
    assigned_agent_id || null,
    protocol_days     || '7,15,30,60,90',
    notes             || null
  ).run()

  // Retorna os dados do paciente criado sem SELECT adicional para evitar race condition D1
  return c.json({
    id,
    name,
    phone:             phone             || null,
    email:             email             || null,
    procedure,
    surgery_date,
    assigned_agent_id: assigned_agent_id || null,
    protocol_days:     protocol_days     || '7,15,30,60,90',
    notes:             notes             || null,
    status:            'active',
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  }, 201)
})

// ── PATCH /api/patients/:id ───────────────────────────────────
patients.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const allowed = ['name','phone','email','procedure','surgery_date','assigned_agent_id','protocol_days','status','notes']
  const fields = Object.keys(body).filter(k => allowed.includes(k))
  if (!fields.length) return c.json({ error: 'Nenhum campo válido enviado' }, 400)

  const sets = fields.map(f => `${f} = ?`).join(', ')
  const values = fields.map(f => body[f])

  await c.env.DB.prepare(
    `UPDATE patients SET ${sets}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...values, id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(id).first()
  return c.json(updated)
})

// ── DELETE /api/patients/:id (admin only) ─────────────────────
patients.delete('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM patients WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ── Helper: calcular urgência de follow-up ────────────────────
function calcUrgency(patient, today) {
  if (patient.status !== 'active') return 'none'

  const base = patient.last_contact_date || patient.surgery_date
  const daysSince = Math.floor(
    (new Date(today) - new Date(base)) / (1000 * 60 * 60 * 24)
  )

  const protocols = (patient.protocol_days || '30').split(',').map(Number).sort((a,b) => a-b)
  const nextProtocol = protocols.find(d => d > (patient.total_followups > 0
    ? protocols[Math.min(patient.total_followups - 1, protocols.length - 1)]
    : 0
  )) || protocols[protocols.length - 1]

  if (daysSince >= nextProtocol + 3) return 'overdue'   // vermelho
  if (daysSince >= nextProtocol)     return 'due'       // amarelo
  if (daysSince >= nextProtocol - 2) return 'soon'      // laranja leve
  return 'ok'                                           // verde
}

export default patients
