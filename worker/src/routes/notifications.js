import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'

// Notificacoes internas do agente. As rotas de configuracao viviam aqui e
// foram para routes/settings.js, que antes era so um re-export deste arquivo.

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
  const unreadCount = results.filter((notification) => !notification.is_read).length
  return c.json({ notifications: results, unread_count: unreadCount })
})

notifications.patch('/:id/read', async (c) => {
  const agent = c.get('agent')
  const result = await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND agent_id = ?')
    .bind(c.req.param('id'), agent.sub)
    .run()

  if (!result.meta.changes) return c.json({ error: 'Notificação não encontrada' }, 404)
  return c.json({ success: true })
})

notifications.post('/read-all', async (c) => {
  const agent = c.get('agent')

  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE agent_id = ?')
    .bind(agent.sub)
    .run()

  return c.json({ success: true })
})

export default notifications

