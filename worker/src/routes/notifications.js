import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

// ── Notificações ──────────────────────────────────────────────
const notifications = new Hono()
notifications.use('*', authMiddleware)

notifications.get('/', async (c) => {
  const agent = c.get('agent')
  const { unread_only } = c.req.query()

  let sql = `
    SELECT n.*, p.name AS patient_name, p.procedure
    FROM notifications n
    JOIN patients p ON n.patient_id = p.id
    WHERE n.agent_id = ?
  `
  if (unread_only === 'true') sql += ' AND n.is_read = 0'
  sql += ' ORDER BY n.scheduled_for DESC LIMIT 50'

  const { results } = await c.env.DB.prepare(sql).bind(agent.sub).all()
  const unreadCount = results.filter(n => !n.is_read).length
  return c.json({ notifications: results, unread_count: unreadCount })
})

notifications.patch('/:id/read', async (c) => {
  await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ?'
  ).bind(c.req.param('id')).run()
  return c.json({ success: true })
})

notifications.post('/read-all', async (c) => {
  const agent = c.get('agent')
  await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE agent_id = ?'
  ).bind(agent.sub).run()
  return c.json({ success: true })
})

export { notifications as notifRoutes }

// ── Settings ──────────────────────────────────────────────────
const settings = new Hono()
settings.use('*', authMiddleware)

settings.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT key, value FROM app_settings'
  ).all()
  const map = Object.fromEntries(results.map(r => [r.key, r.value]))
  return c.json(map)
})

settings.patch('/', adminOnly, async (c) => {
  const body = await c.req.json()
  const allowed = ['clinic_name', 'primary_color', 'logo_url', 'timezone']

  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue
    await c.env.DB.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(key, value).run()
  }
  return c.json({ success: true })
})

// Telegram config
settings.get('/telegram', adminOnly, async (c) => {
  const cfg = await c.env.DB.prepare('SELECT * FROM telegram_config WHERE id = 1').first()
  if (cfg?.bot_token) cfg.bot_token = cfg.bot_token.slice(0, 8) + '...' // mascarar
  return c.json(cfg || {})
})

settings.put('/telegram', adminOnly, async (c) => {
  const { bot_token, default_chat_id, notify_group, group_chat_id } = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE telegram_config SET
      bot_token = ?, default_chat_id = ?, notify_group = ?, group_chat_id = ?, updated_at = datetime('now')
    WHERE id = 1
  `).bind(
    bot_token, default_chat_id,
    notify_group ? 1 : 0,
    group_chat_id || null
  ).run()
  return c.json({ success: true })
})

export { settings as settingsRoutes }
export default notifications
