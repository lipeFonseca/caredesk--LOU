import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'

const activity = new Hono()
activity.use('*', authMiddleware)

// ── GET /api/activity ─────────────────────────────────────────
// Feed de historico (Status.md 13.3): ultimas alteracoes do sistema, derivado
// de dados que ja existem — pacientes cadastrados (patients) e contatos feitos
// (followup_logs). Nao ha tabela de eventos; e 100% leitura, sem novo caminho
// de escrita. Ordenado por timestamp DESC, sempre paginado ({ items, total }).
activity.get('/', async (c) => {
  const { page, limit } = c.req.query()

  const pageNum  = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const offset   = (pageNum - 1) * limitNum

  const countRow = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM patients) +
      (SELECT COUNT(*) FROM followup_logs) AS total
  `).first()
  const total = countRow?.total ?? 0

  const { results } = await c.env.DB.prepare(`
    SELECT kind, ts, patient_id, patient_name, agent_name, contact_type, outcome
    FROM (
      SELECT
        'patient_created' AS kind,
        p.created_at      AS ts,
        p.id              AS patient_id,
        p.name            AS patient_name,
        ca.name           AS agent_name,
        NULL              AS contact_type,
        NULL              AS outcome
      FROM patients p
      LEFT JOIN agents ca ON p.created_by = ca.id

      UNION ALL

      SELECT
        'contact'    AS kind,
        fl.created_at AS ts,
        fl.patient_id AS patient_id,
        p.name        AS patient_name,
        a.name        AS agent_name,
        fl.contact_type AS contact_type,
        fl.outcome    AS outcome
      FROM followup_logs fl
      JOIN patients p      ON fl.patient_id = p.id
      LEFT JOIN agents a   ON fl.agent_id = a.id
    )
    ORDER BY ts DESC
    LIMIT ? OFFSET ?
  `).bind(limitNum, offset).all()

  return c.json({ items: results ?? [], total })
})

export default activity
