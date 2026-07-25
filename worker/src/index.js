import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import authRoutes      from './routes/auth.js'
import patientRoutes   from './routes/patients.js'
import followupRoutes  from './routes/followups.js'
import agentRoutes     from './routes/agents.js'
import notifRoutes     from './routes/notifications.js'
import settingsRoutes  from './routes/settings.js'
import setupRoutes     from './routes/setup.js'
import protocolRoutes  from './routes/protocols.js'
import messageProtocolRoutes from './routes/message-protocols.js'
import documentTemplateRoutes from './routes/document-templates.js'
import activityRoutes  from './routes/activity.js'
import logRoutes       from './routes/logs.js'
import dashboardRoutes from './routes/dashboard.js'
import { runScheduler, runNightlyCleanup } from './services/scheduler.js'
import { runDailyDigest } from './services/daily-digest.js'
import { recordServerError } from './services/error-log.js'

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
    return allowed.includes(origin) ? origin : false
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.use('*', secureHeaders({
  // API e consumida de um dominio diferente (Pages) — CORP 'same-origin' bloquearia
  // as imagens de branding/avatar servidas aqui (<img src="...worker.../api/..."/>).
  crossOriginResourcePolicy: 'cross-origin',
  xFrameOptions: 'DENY',
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
app.route('/api/protocols',     protocolRoutes)
app.route('/api/message-protocols', messageProtocolRoutes)
app.route('/api/document-templates', documentTemplateRoutes)
app.route('/api/activity',      activityRoutes)
app.route('/api/logs',          logRoutes)
app.route('/api/dashboard',     dashboardRoutes)

// ── 404 ──────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Rota não encontrada' }, 404))

// ── Error handler ─────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[CareDesk Error]', err)

  const gravacaoDoLog = recordServerError(c.env, err, c)
  try {
    // Mantem o worker vivo ate o INSERT terminar sem atrasar a resposta 500.
    c.executionCtx.waitUntil(gravacaoDoLog)
  } catch {
    // Fora do runtime do Workers (teste, invocacao direta) nao existe
    // executionCtx. A promise ja esta em andamento e recordServerError nunca
    // rejeita, entao ignorar aqui e seguro.
  }

  return c.json({ error: 'Erro interno do servidor' }, 500)
})

// ── Export principal (fetch + scheduled) ─────────────────────
export default {
  fetch: app.fetch,

  // Três crons no wrangler.toml, roteados pelo horário UTC que disparou.
  // Cron desconhecido cai no scheduler de follow-ups, que era a rotina única
  // antes das outras existirem.
  async scheduled(event, env, ctx) {
    const rotinaPorCron = {
      '0 3 * * *':  runNightlyCleanup, // 00:00 Fortaleza
      '0 11 * * *': runScheduler,      // 08:00 Fortaleza
      '0 23 * * *': runDailyDigest,    // 20:00 Fortaleza
    }

    ctx.waitUntil((rotinaPorCron[event.cron] ?? runScheduler)(env))
  },
}
