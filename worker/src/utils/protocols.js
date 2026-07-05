function normalizeProtocolDays(protocolDays) {
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
