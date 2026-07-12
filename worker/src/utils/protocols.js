export const DEFAULT_PROTOCOL_DAYS = Object.freeze([-2, 0, 2, 5, 15, 30, 60, 90, 120, 180])

export const PROTOCOL_DAY_SOURCES = Object.freeze({
  LINKED: 'linked_protocol',
  DEFAULT: 'default_protocol',
  GLOBAL: 'global_setting',
  LEGACY: 'legacy_patient',
  EMPTY: 'empty',
})

export function normalizeProtocolDays(protocolDays) {
  if (!Array.isArray(protocolDays)) return []

  return [...new Set(
    protocolDays
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value))
  )].sort((a, b) => a - b)
}

export function parseProtocolDays(...sources) {
  for (const source of sources) {
    if (!source) continue

    if (Array.isArray(source)) {
      const normalized = normalizeProtocolDays(source)
      if (normalized.length) return normalized
      continue
    }

    if (typeof source !== 'string') continue

    const trimmed = source.trim()
    if (!trimmed) continue

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const normalized = normalizeProtocolDays(parsed)
        if (normalized.length) return normalized
      }
    } catch {
      const parsed = trimmed
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value))

      const normalized = normalizeProtocolDays(parsed)
      if (normalized.length) return normalized
    }
  }

  return []
}

export async function getProtocolResolutionContext(db) {
  const defaultProtocolRow = await db.prepare(`
    SELECT id, name, description, days, color, is_default, is_custom
    FROM contact_protocols
    WHERE is_default = 1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).first()

  const globalSettingRow = await db.prepare(`
    SELECT value
    FROM app_settings
    WHERE key = 'contact_protocol_days'
    LIMIT 1
  `).first()

  const defaultProtocol = defaultProtocolRow
    ? {
        ...defaultProtocolRow,
        days: parseProtocolDays(defaultProtocolRow.days),
      }
    : null

  return {
    defaultProtocol,
    globalProtocolDays: parseProtocolDays(globalSettingRow?.value),
  }
}

export function resolvePatientProtocol(patient, context = {}) {
  const linkedDays = parseProtocolDays(patient.protocol_days_json, patient._proto_days)
  if (linkedDays.length) {
    return buildResolvedProtocol({
      source: PROTOCOL_DAY_SOURCES.LINKED,
      days: linkedDays,
      protocolId: patient.protocol_id ?? null,
      protocolName: patient.protocol_name ?? null,
      protocolDescription: patient.protocol_description ?? null,
      protocolColor: patient.protocol_color ?? null,
      protocolIsCustom: patient.protocol_is_custom ?? 0,
    })
  }

  const defaultDays = parseProtocolDays(context.defaultProtocol?.days)
  if (defaultDays.length) {
    return buildResolvedProtocol({
      source: PROTOCOL_DAY_SOURCES.DEFAULT,
      days: defaultDays,
      protocolId: context.defaultProtocol.id,
      protocolName: context.defaultProtocol.name,
      protocolDescription: context.defaultProtocol.description,
      protocolColor: context.defaultProtocol.color,
      protocolIsCustom: context.defaultProtocol.is_custom ?? 0,
    })
  }

  const globalDays = parseProtocolDays(context.globalProtocolDays)
  if (globalDays.length) {
    return buildResolvedProtocol({
      source: PROTOCOL_DAY_SOURCES.GLOBAL,
      days: globalDays,
    })
  }

  const legacyDays = parseProtocolDays(patient.protocol_days)
  if (legacyDays.length) {
    return buildResolvedProtocol({
      source: PROTOCOL_DAY_SOURCES.LEGACY,
      days: legacyDays,
      protocolId: patient.protocol_id ?? null,
      protocolName: patient.protocol_name ?? null,
      protocolDescription: patient.protocol_description ?? null,
      protocolColor: patient.protocol_color ?? null,
      protocolIsCustom: patient.protocol_is_custom ?? 0,
    })
  }

  return buildResolvedProtocol({
    source: PROTOCOL_DAY_SOURCES.EMPTY,
    days: [],
  })
}

export function attachResolvedProtocol(patient, resolution) {
  return {
    ...patient,
    protocol_days_parsed: resolution.days,
    protocol_days_source: resolution.source,
    resolved_protocol_id: resolution.protocolId,
    resolved_protocol_name: resolution.protocolName,
    resolved_protocol_description: resolution.protocolDescription,
    resolved_protocol_color: resolution.protocolColor,
    resolved_protocol_is_custom: resolution.protocolIsCustom,
  }
}

export function countCompletedProtocolSteps(followupCount) {
  return Math.max(0, Number(followupCount) || 0)
}

export function buildProtocolMilestones(surgeryDate, protocolDays) {
  if (!surgeryDate) return []

  return normalizeProtocolDays(protocolDays).map((day, index) => {
    const date = new Date(`${surgeryDate}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + day)
    return {
      day,
      index,
      date,
      dateStr: date.toISOString().split('T')[0],
    }
  })
}

export function getNextPendingMilestone(surgeryDate, protocolDays, completedCount) {
  const milestones = buildProtocolMilestones(surgeryDate, protocolDays)
  return milestones[countCompletedProtocolSteps(completedCount)] || null
}

export function calcProtocolUrgency(patient, protocolDays, todayStr) {
  if (patient.status !== 'active') return 'none'
  if (!patient.surgery_date) return 'none'

  const nextMilestone = getNextPendingMilestone(
    patient.surgery_date,
    protocolDays,
    patient.total_followups
  )

  if (!nextMilestone) return 'none'

  if (nextMilestone.dateStr < todayStr) return 'overdue'
  if (nextMilestone.dateStr === todayStr) return 'due'

  const msDay = 1000 * 60 * 60 * 24
  const daysUntil = Math.round(
    (new Date(`${nextMilestone.dateStr}T12:00:00Z`) - new Date(`${todayStr}T12:00:00Z`)) / msDay
  )

  if (daysUntil <= 2) return 'soon'
  return 'ok'
}

function buildResolvedProtocol({
  source,
  days,
  protocolId = null,
  protocolName = null,
  protocolDescription = null,
  protocolColor = null,
  protocolIsCustom = 0,
}) {
  return {
    source,
    days: normalizeProtocolDays(days),
    protocolId,
    protocolName,
    protocolDescription,
    protocolColor,
    protocolIsCustom: Number(protocolIsCustom || 0),
  }
}
