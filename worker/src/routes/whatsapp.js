import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  getWhatsAppConfig,
  getWhatsAppTemplates,
  getWhatsAppVariableOptions,
  serializeWhatsAppTemplates,
} from '../services/whatsapp.js'

const whatsapp = new Hono()
whatsapp.use('*', authMiddleware)

whatsapp.get('/config', async (c) => {
  const settingsMap = await getSettingsMap(c.env.DB)
  const config = getWhatsAppConfig(settingsMap)
  const templates = getWhatsAppTemplates(settingsMap)

  return c.json({
    ...config,
    default_template_id: resolveDefaultTemplateId(config.defaultTemplateId, templates),
    available_variables: getWhatsAppVariableOptions(),
  })
})

whatsapp.put('/config', adminOnly, async (c) => {
  const body = await c.req.json()

  await upsertSetting(c.env.DB, 'whatsapp_enabled', body.enabled ? '1' : '0')
  await upsertSetting(c.env.DB, 'whatsapp_country_code', body.country_code || '55')
  await upsertSetting(c.env.DB, 'whatsapp_open_delay_ms', String(body.open_delay_ms || 800))
  await upsertSetting(c.env.DB, 'whatsapp_default_template_id', body.default_template_id || '')

  return c.json({ success: true })
})

whatsapp.get('/templates', async (c) => {
  const settingsMap = await getSettingsMap(c.env.DB)
  return c.json(getWhatsAppTemplates(settingsMap))
})

whatsapp.post('/templates', adminOnly, async (c) => {
  const body = await c.req.json()
  const settingsMap = await getSettingsMap(c.env.DB)
  const templates = getWhatsAppTemplates(settingsMap)
  const now = new Date().toISOString()

  const nextTemplate = {
    id: crypto.randomUUID(),
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    content: String(body.content || '').trim(),
    is_default: Boolean(body.is_default),
    is_active: 'is_active' in body ? Boolean(body.is_active) : true,
    created_at: now,
    updated_at: now,
  }

  if (!nextTemplate.name) return c.json({ error: 'Nome do modelo é obrigatório' }, 400)
  if (!nextTemplate.content) return c.json({ error: 'Mensagem do modelo é obrigatória' }, 400)

  const updatedTemplates = normalizeDefaultFlag([...templates, nextTemplate], nextTemplate.id, nextTemplate.is_default)

  await upsertSetting(c.env.DB, 'whatsapp_message_templates', serializeWhatsAppTemplates(updatedTemplates))
  if (nextTemplate.is_default) {
    await upsertSetting(c.env.DB, 'whatsapp_default_template_id', nextTemplate.id)
  }

  return c.json(updatedTemplates.find(template => template.id === nextTemplate.id), 201)
})

whatsapp.patch('/templates/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const settingsMap = await getSettingsMap(c.env.DB)
  const templates = getWhatsAppTemplates(settingsMap)
  const existing = templates.find(template => template.id === id)

  if (!existing) return c.json({ error: 'Modelo não encontrado' }, 404)

  const updatedTemplate = {
    ...existing,
    name: 'name' in body ? String(body.name || '').trim() : existing.name,
    description: 'description' in body ? String(body.description || '').trim() : existing.description,
    content: 'content' in body ? String(body.content || '').trim() : existing.content,
    is_default: 'is_default' in body ? Boolean(body.is_default) : existing.is_default,
    is_active: 'is_active' in body ? Boolean(body.is_active) : existing.is_active,
    updated_at: new Date().toISOString(),
  }

  if (!updatedTemplate.name) return c.json({ error: 'Nome do modelo é obrigatório' }, 400)
  if (!updatedTemplate.content) return c.json({ error: 'Mensagem do modelo é obrigatória' }, 400)

  const updatedTemplates = normalizeDefaultFlag(
    templates.map(template => template.id === id ? updatedTemplate : template),
    id,
    updatedTemplate.is_default
  )

  await upsertSetting(c.env.DB, 'whatsapp_message_templates', serializeWhatsAppTemplates(updatedTemplates))
  if (updatedTemplate.is_default) {
    await upsertSetting(c.env.DB, 'whatsapp_default_template_id', id)
  } else if ((settingsMap.whatsapp_default_template_id || '') === id) {
    await upsertSetting(c.env.DB, 'whatsapp_default_template_id', resolveDefaultTemplateId('', updatedTemplates))
  }

  return c.json(updatedTemplates.find(template => template.id === id))
})

whatsapp.delete('/templates/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const settingsMap = await getSettingsMap(c.env.DB)
  const templates = getWhatsAppTemplates(settingsMap)
  const existing = templates.find(template => template.id === id)

  if (!existing) return c.json({ error: 'Modelo não encontrado' }, 404)

  const updatedTemplates = templates.filter(template => template.id !== id)
  await upsertSetting(c.env.DB, 'whatsapp_message_templates', serializeWhatsAppTemplates(updatedTemplates))

  const currentDefaultId = settingsMap.whatsapp_default_template_id || ''
  if (currentDefaultId === id) {
    await upsertSetting(c.env.DB, 'whatsapp_default_template_id', resolveDefaultTemplateId('', updatedTemplates))
  }

  return c.json({ success: true })
})

export default whatsapp

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

function resolveDefaultTemplateId(defaultTemplateId, templates) {
  if (defaultTemplateId && templates.some(template => template.id === defaultTemplateId)) {
    return defaultTemplateId
  }

  return templates.find(template => template.is_default)?.id || templates[0]?.id || ''
}

function normalizeDefaultFlag(templates, selectedId, forceDefault) {
  const nextTemplates = templates.map((template) => ({
    ...template,
    is_default: forceDefault ? template.id === selectedId : template.is_default,
  }))

  if (forceDefault) return nextTemplates

  const hasDefault = nextTemplates.some(template => template.is_default)
  if (hasDefault) return nextTemplates

  return nextTemplates.map((template, index) => (
    index === 0 ? { ...template, is_default: true } : template
  ))
}
