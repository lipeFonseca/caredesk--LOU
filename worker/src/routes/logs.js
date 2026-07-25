import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { RETENTION_DAYS } from '../services/error-log.js'

const logs = new Hono()
logs.use('*', authMiddleware)

// ── GET /api/logs ─────────────────────────────────────────────
// Aba de Logs: erros de servidor gravados pelo app.onError. Restrito a admin —
// message/stack expoem detalhe interno da aplicacao. Paginado no mesmo formato
// de /api/activity ({ items, total }).
logs.get('/', adminOnly, async (c) => {
  const { page, limit } = c.req.query()

  const pageNum  = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const offset   = (pageNum - 1) * limitNum

  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM error_logs').first()

  const { results } = await c.env.DB.prepare(`
    SELECT id, occurred_at, method, path, message, stack, agent_id, agent_email, ip
    FROM error_logs
    ORDER BY occurred_at DESC
    LIMIT ? OFFSET ?
  `).bind(limitNum, offset).all()

  return c.json({
    items: results ?? [],
    total: countRow?.total ?? 0,
    retention_days: RETENTION_DAYS,
  })
})

export default logs
