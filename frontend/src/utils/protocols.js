import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'

export function normalizeProtocolDays(protocolDays) {
  if (!Array.isArray(protocolDays)) return []

  return [...new Set(
    protocolDays
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value))
  )].sort((a, b) => a - b)
}

export function getCompletedProtocolCount(logs = []) {
  return logs.filter((log) => !log?.is_extra_contact).length
}

export function buildProtocolMilestones(surgeryDate, protocolDays) {
  if (!surgeryDate) return []

  const baseDate = parseISO(surgeryDate)
  return normalizeProtocolDays(protocolDays).map((day, index) => {
    const date = addDays(baseDate, day)
    return {
      day,
      index,
      date,
      dateStr: date.toISOString().split('T')[0],
    }
  })
}

export function getNextFollowup(patient, protocolDays, referenceDate = new Date()) {
  if (!patient?.surgery_date) return null

  const milestones = buildProtocolMilestones(patient.surgery_date, protocolDays)
  if (!milestones.length) return null

  const completedCount = getCompletedProtocolCount(patient.followup_logs)
  const next = milestones[completedCount]
  if (!next) return null

  const daysRemaining = differenceInCalendarDays(next.date, referenceDate)
  const previousMilestone = completedCount > 0 ? milestones[completedCount - 1] : null

  // Usa a distancia entre o marco anterior e o atual como janela de contagem.
  const totalWindowDays = previousMilestone
    ? Math.max(1, differenceInCalendarDays(next.date, previousMilestone.date))
    : Math.max(1, Math.abs(next.day))

  const elapsedWindowDays = Math.max(0, totalWindowDays - Math.max(0, daysRemaining))
  const countdownProgress = daysRemaining <= 0
    ? 0
    : Math.max(0, Math.min(100, Math.round(((totalWindowDays - elapsedWindowDays) / totalWindowDays) * 100)))

  return {
    ...next,
    daysRemaining,
    label: formatFollowupLabel(daysRemaining),
    countdownProgress,
  }
}

export function buildProtocolTimeline(patient, protocolDays, referenceDate = new Date()) {
  if (!patient?.surgery_date) return []

  const milestones = buildProtocolMilestones(patient.surgery_date, protocolDays)
  const completedCount = getCompletedProtocolCount(patient.followup_logs)

  return milestones.map((milestone, index) => {
    let status = 'upcoming'

    if (index < completedCount) {
      status = 'completed'
    } else if (index === completedCount) {
      const daysRemaining = differenceInCalendarDays(milestone.date, referenceDate)
      status = daysRemaining < 0 ? 'overdue' : daysRemaining === 0 ? 'due' : 'next'
    }

    return {
      ...milestone,
      status,
    }
  })
}

export function formatProtocolDay(day) {
  if (day < 0) return `${Math.abs(day)} dia${Math.abs(day) === 1 ? '' : 's'} antes da cirurgia`
  if (day === 0) return 'Dia da cirurgia'
  return `${day} dia${day === 1 ? '' : 's'} depois da cirurgia`
}

export function formatProtocolDayShort(day) {
  if (day < 0) return `${Math.abs(day)}d antes`
  if (day === 0) return 'Cirurgia'
  return `${day}d depois`
}

export function formatFollowupLabel(daysRemaining) {
  if (daysRemaining === 0) return 'Contato hoje'

  const absDays = Math.abs(daysRemaining)
  const unit = absDays === 1 ? 'dia' : 'dias'

  if (daysRemaining > 0) return `Contato em ${absDays} ${unit}`
  return `Contato em atraso ha ${absDays} ${unit}`
}
