import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import authRoutes     from './routes/auth.js'
import patientRoutes  from './routes/patients.js'
import followupRoutes from './routes/followups.js'
import agentRoutes    from './routes/agents.js'
import notifRoutes    from './routes/notifications.js'
import settingsRoutes from './routes/settings.js'
import setupRoutes    from './routes/setup.js'
import { runScheduler } from './services/scheduler.js'

const app = new Hono()

// ── Middlewares globais ───────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = [
      c.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:4173',
    ]
    return allowed.includes(origin) ? origin : allowed[0]
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ── Health check ─────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', app: 'CareDesk' }))

// ── Rotas da API ─────────────────────────────────────────────
app.route('/api/auth',          authRoutes)
app.route('/api/patients',      patientRoutes)
app.route('/api/followups',     followupRoutes)
app.route('/api/agents',        agentRoutes)
app.route('/api/notifications', notifRoutes)
app.route('/api/settings',      settingsRoutes)
app.route('/api/setup',         setupRoutes)

// ── 404 ──────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Rota não encontrada' }, 404))

// ── Error handler ─────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[CareDesk Error]', err)
  return c.json({ error: 'Erro interno do servidor' }, 500)
})

// ── Export principal (fetch + scheduled) ─────────────────────
export default {
  fetch: app.fetch,

  // Cron trigger do wrangler.toml — roda todo dia às 8h Fortaleza
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env))
  },
}
