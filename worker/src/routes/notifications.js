import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  buildAssetResponse,
  deleteAssetIfPresent,
  putImageAsset,
  sanitizeScopedAssetKey,
} from '../utils/storage.js'

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
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')
    .bind(c.req.param('id'))
    .run()

  return c.json({ success: true })
})

notifications.post('/read-all', async (c) => {
  const agent = c.get('agent')

  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE agent_id = ?')
    .bind(agent.sub)
    .run()

  return c.json({ success: true })
})

export { notifications as notifRoutes }

const settings = new Hono()

settings.get('/logo/:key', async (c) => {
  if (!c.env.LOGO_BUCKET) {
    return c.json({ error: 'Storage de branding nao configurado' }, 503)
  }

  const key = sanitizeScopedAssetKey(c.req.param('key'), ['logos', 'backgrounds', 'favicons', 'login-images'])
  if (!key) return c.json({ error: 'Asset nao encontrado' }, 404)

  const response = await buildAssetResponse(c.env.LOGO_BUCKET, key)
  if (!response) return c.json({ error: 'Asset nao encontrado' }, 404)
  return response
})

settings.get('/public', async (c) => {
  const settingsMap = await getSettingsMap(c.env.DB)
  return c.json(buildPublicSettingsPayload(settingsMap))
})

settings.use('*', authMiddleware)

settings.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM app_settings').all()
  return c.json(Object.fromEntries(results.map((row) => [row.key, row.value])))
})

settings.patch('/', adminOnly, async (c) => {
  const body = await c.req.json()
  const allowed = [
    'clinic_name',
    'clinic_tagline',
    'hero_title',
    'hero_subtitle',
    'primary_color',
    'logo_url',
    'background_image_url',
    'login_image_url',
    'favicon_url',
    'login_border_effect_enabled',
    'login_border_preset',
    'login_border_color_1',
    'login_border_color_2',
    'login_border_color_3',
    'login_border_color_back',
    'login_border_intensity',
    'login_border_speed',
    'login_border_thickness',
    'login_border_bloom',
    'timezone',
    'contact_protocol_days',
  ]

  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue
    await upsertSetting(c.env.DB, key, value)
  }

  return c.json({ success: true })
})

settings.post('/logo', adminOnly, async (c) => uploadBrandAsset(c, 'logo'))
settings.delete('/logo', adminOnly, async (c) => removeBrandAsset(c, 'logo'))
settings.post('/assets/:type', adminOnly, async (c) => uploadBrandAsset(c, c.req.param('type')))
settings.delete('/assets/:type', adminOnly, async (c) => removeBrandAsset(c, c.req.param('type')))

settings.patch('/protocol', adminOnly, async (c) => {
  const { days } = await c.req.json()
  if (!Array.isArray(days)) return c.json({ error: 'days deve ser um array' }, 400)

  const sorted = [...new Set(days.map(Number))]
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b)

  await c.env.DB.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('contact_protocol_days', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify(sorted)).run()

  return c.json({ success: true, days: sorted })
})

export { settings as settingsRoutes }
export default notifications

async function uploadBrandAsset(c, type) {
  const config = BRAND_ASSET_CONFIG[type]
  if (!config) return c.json({ error: 'Tipo de asset invalido' }, 400)
  if (!c.env.LOGO_BUCKET) {
    return c.json({ error: 'Storage de branding nao configurado no Worker' }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') || formData.get(type)

  const settingsMap = await getSettingsMap(c.env.DB)
  const currentKey = settingsMap[config.storageKey] || null
  let objectKey

  try {
    const stored = await putImageAsset(c.env.LOGO_BUCKET, file, config)
    objectKey = stored.objectKey
  } catch (err) {
    return c.json({ error: err.message || 'Nao foi possivel enviar o arquivo' }, 400)
  }

  if (currentKey) {
    await deleteAssetIfPresent(c.env.LOGO_BUCKET, currentKey)
  }

  const assetUrl = new URL(`/api/settings/logo/${encodeURIComponent(objectKey)}`, c.req.url).toString()
  await upsertSetting(c.env.DB, config.urlKey, assetUrl)
  await upsertSetting(c.env.DB, config.storageKey, objectKey)

  return c.json({ success: true, [config.urlKey]: assetUrl })
}

async function removeBrandAsset(c, type) {
  const config = BRAND_ASSET_CONFIG[type]
  if (!config) return c.json({ error: 'Tipo de asset invalido' }, 400)

  const settingsMap = await getSettingsMap(c.env.DB)
  const currentKey = settingsMap[config.storageKey] || null

  if (currentKey && c.env.LOGO_BUCKET) {
    await deleteAssetIfPresent(c.env.LOGO_BUCKET, currentKey)
  }

  await upsertSetting(c.env.DB, config.urlKey, '')
  await upsertSetting(c.env.DB, config.storageKey, '')

  return c.json({ success: true })
}

async function getSettingsMap(db) {
  const { results } = await db.prepare('SELECT key, value FROM app_settings').all()
  return Object.fromEntries(results.map((row) => [row.key, row.value]))
}

function buildPublicSettingsPayload(settingsMap = {}) {
  const allowed = [
    'clinic_name',
    'clinic_tagline',
    'hero_title',
    'hero_subtitle',
    'primary_color',
    'logo_url',
    'background_image_url',
    'login_image_url',
    'favicon_url',
    'login_border_effect_enabled',
    'login_border_preset',
    'login_border_color_1',
    'login_border_color_2',
    'login_border_color_3',
    'login_border_color_back',
    'login_border_intensity',
    'login_border_speed',
    'login_border_thickness',
    'login_border_bloom',
    'timezone',
  ]

  return Object.fromEntries(
    allowed
      .filter((key) => Object.hasOwn(settingsMap, key))
      .map((key) => [key, settingsMap[key]])
  )
}

async function upsertSetting(db, key, value) {
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, String(value ?? '')).run()
}

const BRAND_ASSET_CONFIG = {
  logo: {
    folder: 'logos',
    urlKey: 'logo_url',
    storageKey: 'logo_storage_key',
    maxSizeMb: 5,
  },
  background: {
    folder: 'backgrounds',
    urlKey: 'background_image_url',
    storageKey: 'background_image_storage_key',
    maxSizeMb: 8,
  },
  login: {
    folder: 'login-images',
    urlKey: 'login_image_url',
    storageKey: 'login_image_storage_key',
    maxSizeMb: 8,
  },
  favicon: {
    folder: 'favicons',
    urlKey: 'favicon_url',
    storageKey: 'favicon_storage_key',
    maxSizeMb: 2,
  },
}
