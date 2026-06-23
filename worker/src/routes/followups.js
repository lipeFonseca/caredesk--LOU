import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'

const followups = new Hono()
followups.use('*', authMiddleware)

// ── GET /api/followups?patient_id=xxx ─────────────────────────
followups.get('/', async (c) => {
  const { patient_id } = c.req.query()
  if (!patient_id) return c.json({ error: 'patient_id obrigatório' }, 400)

  const { results } = await c.env.DB.prepare(`
    SELECT fl.*, a.name AS agent_name
    FROM followup_logs fl
    LEFT JOIN agents a ON fl.agent_id = a.id
    WHERE fl.patient_id = ?
    ORDER BY fl.contact_date DESC
  `).bind(patient_id).all()

  return c.json(results)
})

// ── POST /api/followups ───────────────────────────────────────
followups.post('/', async (c) => {
  const body = await c.req.json()
  const { patient_id, contact_date, contact_type, outcome, notes, next_followup_date } = body
  const agent = c.get('agent')

  if (!patient_id) return c.json({ error: 'patient_id obrigatório' }, 400)

  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ?'
  ).bind(patient_id).first()
  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const id = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO followup_logs (id, patient_id, agent_id, contact_date, contact_type, outcome, notes, next_followup_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, patient_id, agent.sub,
    contact_date || new Date().toISOString().split('T')[0],
    contact_type || 'call',
    outcome || 'reached',
    notes || null,
    next_followup_date || null
  ).run()

  // Marcar notificações do dia como lidas para esse paciente
  await c.env.DB.prepare(`
    UPDATE notifications SET is_read = 1
    WHERE patient_id = ? AND is_read = 0
  `).bind(patient_id).run()

  const created = await c.env.DB.prepare(
    'SELECT * FROM followup_logs WHERE id = ?'
  ).bind(id).first()

  return c.json(created, 201)
})

// ── PATCH /api/followups/:id ──────────────────────────────────
followups.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const allowed = ['contact_date','contact_type','outcome','notes','next_followup_date']
  const fields = Object.keys(body).filter(k => allowed.includes(k))
  if (!fields.length) return c.json({ error: 'Nenhum campo válido' }, 400)

  const sets = fields.map(f => `${f} = ?`).join(', ')
  await c.env.DB.prepare(
    `UPDATE followup_logs SET ${sets} WHERE id = ?`
  ).bind(...fields.map(f => body[f]), id).run()

  return c.json(await c.env.DB.prepare(
    'SELECT * FROM followup_logs WHERE id = ?'
  ).bind(id).first())
})

export default followups
