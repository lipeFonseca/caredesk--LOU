import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

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

  const key = sanitizeLogoKey(c.req.param('key'))
  if (!key) return c.json({ error: 'Asset nao encontrado' }, 404)

  const object = await c.env.LOGO_BUCKET.get(key)
  if (!object) return c.json({ error: 'Asset nao encontrado' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=86400')
  headers.set('access-control-allow-origin', '*')

  return new Response(object.body, { headers })
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
    'favicon_url',
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
  if (!(file instanceof File)) {
    return c.json({ error: 'Envie um arquivo valido' }, 400)
  }

  if (!isSupportedAssetType(file.type)) {
    return c.json({ error: 'Formato invalido. Use PNG, JPG, SVG, WebP ou ICO' }, 400)
  }

  if (file.size > config.maxSizeMb * 1024 * 1024) {
    return c.json({ error: `O arquivo deve ter no maximo ${config.maxSizeMb} MB` }, 400)
  }

  const settingsMap = await getSettingsMap(c.env.DB)
  const currentKey = settingsMap[config.storageKey] || null
  const objectKey = `${config.folder}/${crypto.randomUUID()}${extensionForMimeType(file.type, file.name)}`

  await c.env.LOGO_BUCKET.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=86400',
    },
  })

  if (currentKey) {
    await c.env.LOGO_BUCKET.delete(currentKey).catch(() => {})
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
    await c.env.LOGO_BUCKET.delete(currentKey).catch(() => {})
  }

  await upsertSetting(c.env.DB, config.urlKey, '')
  await upsertSetting(c.env.DB, config.storageKey, '')

  return c.json({ success: true })
}

async function getSettingsMap(db) {
  const { results } = await db.prepare('SELECT key, value FROM app_settings').all()
  return Object.fromEntries(results.map((row) => [row.key, row.value]))
}

async function upsertSetting(db, key, value) {
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, String(value ?? '')).run()
}

function isSupportedAssetType(type) {
  return [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon',
  ].includes(type)
}

function extensionForMimeType(type, originalName = '') {
  const byMime = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
  }

  if (byMime[type]) return byMime[type]

  const match = /\.[a-z0-9]+$/i.exec(originalName)
  return match ? match[0].toLowerCase() : ''
}

function sanitizeLogoKey(value) {
  if (!value) return null
  const normalized = decodeURIComponent(value).replace(/^\/+/, '')
  if (!/^(logos|backgrounds|favicons)\/[a-z0-9-]+\.(png|jpg|jpeg|webp|svg|ico)$/i.test(normalized)) {
    return null
  }
  return normalized
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
  favicon: {
    folder: 'favicons',
    urlKey: 'favicon_url',
    storageKey: 'favicon_storage_key',
    maxSizeMb: 2,
  },
}
