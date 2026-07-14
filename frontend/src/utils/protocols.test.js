import { describe, it, expect } from 'vitest'
import { parseISO } from 'date-fns'
import {
  normalizeProtocolDays,
  getCompletedProtocolCount,
  buildProtocolMilestones,
  getNextFollowup,
  buildProtocolTimeline,
  formatProtocolDay,
  formatProtocolDayShort,
  formatFollowupLabel,
} from './protocols'

describe('normalizeProtocolDays', () => {
  it('dedupes, sorts and coerces numeric strings', () => {
    expect(normalizeProtocolDays(['10', 0, '0', -2, 5])).toEqual([-2, 0, 5, 10])
  })

  it('drops non-numeric values (null coerces to 0)', () => {
    expect(normalizeProtocolDays([1, 'abc', null, 2])).toEqual([0, 1, 2])
  })

  it('returns empty array for non-array input', () => {
    expect(normalizeProtocolDays(null)).toEqual([])
    expect(normalizeProtocolDays(undefined)).toEqual([])
  })
})

describe('getCompletedProtocolCount', () => {
  it('counts only non-extra logs', () => {
    const logs = [{ is_extra_contact: 0 }, { is_extra_contact: 1 }, { is_extra_contact: 0 }]
    expect(getCompletedProtocolCount(logs)).toBe(2)
  })

  it('defaults to empty array', () => {
    expect(getCompletedProtocolCount()).toBe(0)
  })
})

describe('buildProtocolMilestones', () => {
  it('returns empty array when there is no surgery date', () => {
    expect(buildProtocolMilestones(null, [0, 10])).toEqual([])
  })

  it('builds a milestone per protocol day, offset from surgery date', () => {
    const milestones = buildProtocolMilestones('2026-01-01', [0, 10, -2])
    expect(milestones.map((m) => m.day)).toEqual([-2, 0, 10])
    expect(milestones.find((m) => m.day === 0).dateStr).toBe('2026-01-01')
    expect(milestones.find((m) => m.day === 10).dateStr).toBe('2026-01-11')
  })
})

describe('getNextFollowup', () => {
  it('returns null without a surgery date', () => {
    expect(getNextFollowup({}, [0, 10])).toBeNull()
  })

  it('returns the next uncompleted milestone with days remaining', () => {
    const patient = { surgery_date: '2026-01-01', followup_logs: [] }
    const next = getNextFollowup(patient, [0, 10], parseISO('2026-01-05'))
    expect(next.day).toBe(0)
    expect(next.daysRemaining).toBe(-4)
  })

  it('advances past completed (non-extra) contacts', () => {
    const patient = {
      surgery_date: '2026-01-01',
      followup_logs: [{ is_extra_contact: 0 }],
    }
    const next = getNextFollowup(patient, [0, 10], parseISO('2026-01-05'))
    expect(next.day).toBe(10)
  })
})

describe('buildProtocolTimeline', () => {
  it('marks milestones completed by log count, then overdue/due/next/upcoming by date', () => {
    const patient = {
      surgery_date: '2026-01-01',
      followup_logs: [{ is_extra_contact: 0 }],
    }
    const timeline = buildProtocolTimeline(patient, [-2, 0, 10], parseISO('2026-01-01'))
    const byDay = Object.fromEntries(timeline.map((t) => [t.day, t.status]))
    expect(byDay[-2]).toBe('completed')
    expect(byDay[0]).toBe('due')
    expect(byDay[10]).toBe('upcoming')
  })

  it('marks the current milestone overdue when its date has passed', () => {
    const patient = { surgery_date: '2026-01-01', followup_logs: [] }
    const timeline = buildProtocolTimeline(patient, [-2, 0, 10], parseISO('2026-01-01'))
    const byDay = Object.fromEntries(timeline.map((t) => [t.day, t.status]))
    expect(byDay[-2]).toBe('overdue')
    expect(byDay[0]).toBe('upcoming')
    expect(byDay[10]).toBe('upcoming')
  })
})

describe('formatProtocolDay / formatProtocolDayShort', () => {
  it('formats negative, zero and positive days', () => {
    expect(formatProtocolDay(-1)).toBe('1 dia antes da cirurgia')
    expect(formatProtocolDay(-2)).toBe('2 dias antes da cirurgia')
    expect(formatProtocolDay(0)).toBe('Dia da cirurgia')
    expect(formatProtocolDay(1)).toBe('1 dia depois da cirurgia')
    expect(formatProtocolDay(5)).toBe('5 dias depois da cirurgia')
  })

  it('formats short variants', () => {
    expect(formatProtocolDayShort(-3)).toBe('3d antes')
    expect(formatProtocolDayShort(0)).toBe('Cirurgia')
    expect(formatProtocolDayShort(7)).toBe('7d depois')
  })
})

describe('formatFollowupLabel', () => {
  it('handles today, future and overdue', () => {
    expect(formatFollowupLabel(0)).toBe('Contato hoje')
    expect(formatFollowupLabel(1)).toBe('Contato em 1 dia')
    expect(formatFollowupLabel(3)).toBe('Contato em 3 dias')
    expect(formatFollowupLabel(-1)).toBe('Contato em atraso ha 1 dia')
    expect(formatFollowupLabel(-4)).toBe('Contato em atraso ha 4 dias')
  })
})
