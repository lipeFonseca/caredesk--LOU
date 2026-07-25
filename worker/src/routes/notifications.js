import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  buildAssetResponse,
  deleteAssetIfPresent,
  putImageAsset,
  sanitizeScopedAssetKey,
} from '../utils/storage.js'
import {
  MESSAGING_SETTING_KEYS,
  SECRET_SETTING_KEYS,
  isMaskedValue,
  redactSettings,
} from '../utils/messagingSettings.js'
import { sendEmail } from '../services/email.js'

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

export { notifications as notifRoutes }

const settings = new Hono()

settings.get('/logo/:key', async (c) => {
  if (!c.env.LOGO_BUCKET) {
    return c.json({ error: 'Storage de branding nao configurado' }, 503)
  }

  const key = sanitizeScopedAssetKey(c.req.param('key'), ['logos', 'backgrounds', 'favicons', 'login-images', 'login-backgrounds'])
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
  // redactSettings mascara o token do relay de e-mail. Esta rota vale pra
  // qualquer agente autenticado, nao so admin — credencial nao pode sair daqui.
  return c.json(redactSettings(Object.fromEntries(results.map((row) => [row.key, row.value]))))
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
    'login_background_image_url',
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
    ...MESSAGING_SETTING_KEYS,
  ]

  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue
    // O formulario devolve o segredo mascarado quando ninguem mexeu no campo;
    // gravar isso apagaria a credencial real.
    if (SECRET_SETTING_KEYS.includes(key) && isMaskedValue(value)) continue
    await upsertSetting(c.env.DB, key, value)
  }

  return c.json({ success: true })
})

// ── POST /api/settings/email/test ────────────────────────────
// Envia um e-mail de teste pro proprio admin logado. Existe porque erro de
// configuracao de relay so aparece quando alguem precisa de verdade do reset de
// senha — e essa e a pior hora pra descobrir.
settings.post('/email/test', adminOnly, async (c) => {
  const { sub } = c.get('agent')
  const agent = await c.env.DB.prepare('SELECT name, email FROM agents WHERE id = ?').bind(sub).first()

  if (!agent?.email?.includes('@')) {
    return c.json({ error: 'Sua conta não tem um e-mail válido cadastrado para receber o teste' }, 400)
  }

  try {
    const resultado = await sendEmail(c.env, {
      to: agent.email,
      subject: 'CareDesk — teste de envio',
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1b1f; line-height: 1.6;">
          <p>Olá, ${agent.name || 'equipe'}.</p>
          <p>Este é um teste de envio do CareDesk. Se você recebeu esta mensagem, a mensageria está configurada corretamente e o fluxo de redefinição de senha vai funcionar.</p>
        </div>
      `.trim(),
    })

    return c.json({ success: true, sentTo: agent.email, remainingQuota: resultado?.remainingQuota ?? null })
  } catch (falhaNoEnvio) {
    // Mensagem real do relay volta pro admin de proposito: sem ela, diagnosticar
    // token errado x URL errada x cota estourada vira adivinhacao. Rota e
    // adminOnly, entao nao expoe nada a mais do que quem configurou ja sabe.
    return c.json({ error: falhaNoEnvio.message || 'Falha ao enviar o e-mail de teste' }, 502)
  }
})

settings.post('/logo', adminOnly, async (c) => uploadBrandAsset(c, 'logo'))
settings.delete('/logo', adminOnly, async (c) => removeBrandAsset(c, 'logo'))
settings.post('/assets/:type', adminOnly, async (c) => uploadBrandAsset(c, c.req.param('type')))
settings.delete('/assets/:type', adminOnly, async (c) => removeBrandAsset(c, c.req.param('type')))

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
    'login_background_image_url',
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
  login_background: {
    folder: 'login-backgrounds',
    urlKey: 'login_background_image_url',
    storageKey: 'login_background_image_storage_key',
    maxSizeMb: 8,
  },
  favicon: {
    folder: 'favicons',
    urlKey: 'favicon_url',
    storageKey: 'favicon_storage_key',
    maxSizeMb: 2,
  },
}
