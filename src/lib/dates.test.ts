import { describe, expect, it } from 'vitest'
import { albumGoal, albumRange, cadenceLabel, computeStreak, DAY, formatRange, isoWeek, nextReminderAt, roundStatus } from './dates'

const t = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

describe('albumRange', () => {
  it('month', () => {
    const r = albumRange('month', t(2026, 8, 15))
    expect(r.name).toBe('Augusti 2026')
    expect(r.start).toBe(t(2026, 8, 1, 0))
    expect(r.end).toBe(t(2026, 9, 1, 0))
  })

  it('autumn season', () => {
    const r = albumRange('season', t(2026, 10, 3))
    expect(r.name).toBe('Hösten 2026')
    expect(r.start).toBe(t(2026, 9, 1, 0))
    expect(r.end).toBe(t(2026, 12, 1, 0))
  })

  it('winter spans the new year', () => {
    const dec = albumRange('season', t(2026, 12, 20))
    const feb = albumRange('season', t(2027, 2, 10))
    expect(dec.name).toBe('Vintern 2026/27')
    expect(feb).toEqual(dec)
    expect(dec.end).toBe(t(2027, 3, 1, 0))
  })

  it('year', () => {
    expect(albumRange('year', t(2026, 6, 1)).name).toBe('Året 2026')
  })
})

describe('roundStatus', () => {
  it('first round is due immediately and covers the last cadence', () => {
    const now = t(2026, 9, 27)
    const s = roundStatus(undefined, 7, now)
    expect(s.isDue).toBe(true)
    expect(s.isFirst).toBe(true)
    expect(s.periodStart).toBe(t(2026, 9, 20, 0))
  })

  it('next round is due cadence days after the last one (from midnight)', () => {
    const last = t(2026, 9, 20, 21)
    expect(roundStatus(last, 7, t(2026, 9, 24)).isDue).toBe(false)
    expect(roundStatus(last, 7, t(2026, 9, 24)).daysLeft).toBe(3)
    expect(roundStatus(last, 7, t(2026, 9, 27, 0)).isDue).toBe(true)
  })
})

describe('reminder-aligned due time', () => {
  const sunday19 = { weekday: 0, time: '19:00' }

  it('snaps to the reminder weekday', () => {
    // Done Sunday evening → due next Sunday 19:00
    expect(roundStatus(t(2026, 9, 20, 21), 7, t(2026, 9, 22), sunday19).dueAt).toBe(t(2026, 9, 27, 19))
    // Done a day late (Monday) → still next Sunday, not the one after
    expect(roundStatus(t(2026, 9, 21, 10), 7, t(2026, 9, 22), sunday19).dueAt).toBe(t(2026, 9, 27, 19))
  })

  it('monthly → first reminder weekday around the month mark', () => {
    expect(roundStatus(t(2026, 10, 5, 12), 30, t(2026, 10, 6), sunday19).dueAt).toBe(t(2026, 11, 1, 19))
  })

  it('short cadence → reminder time on the due day', () => {
    expect(roundStatus(t(2026, 9, 20, 9), 3, t(2026, 9, 21), sunday19).dueAt).toBe(t(2026, 9, 23, 19))
  })

  it('next push = due time, or next slot if already overdue', () => {
    const s = roundStatus(t(2026, 9, 20, 21), 7, t(2026, 9, 22), sunday19)
    expect(nextReminderAt(s, 7, sunday19, t(2026, 9, 22))).toBe(t(2026, 9, 27, 19))
    const overdue = roundStatus(t(2026, 9, 6, 21), 7, t(2026, 9, 22), sunday19)
    expect(overdue.isDue).toBe(true)
    expect(nextReminderAt(overdue, 7, sunday19, t(2026, 9, 22))).toBe(t(2026, 9, 27, 19))
  })

  it('first round (nothing done yet) → next slot, not immediately', () => {
    const first = roundStatus(undefined, 7, t(2026, 9, 22, 10), sunday19)
    expect(nextReminderAt(first, 7, sunday19, t(2026, 9, 22, 10))).toBe(t(2026, 9, 27, 19))
  })
})

describe('computeStreak', () => {
  const weekly = [t(2026, 9, 6), t(2026, 9, 13), t(2026, 9, 20), t(2026, 9, 27)]

  it('counts consecutive rounds', () => {
    expect(computeStreak(weekly, 7, 2, t(2026, 9, 28))).toBe(4)
  })

  it('breaks on a long gap', () => {
    expect(computeStreak([t(2026, 8, 1), ...weekly.slice(2)], 7, 2, t(2026, 9, 28))).toBe(2)
  })

  it('is 0 when the latest round is too old', () => {
    expect(computeStreak(weekly, 7, 2, t(2026, 9, 27) + 10 * DAY)).toBe(0)
  })

  it('is 0 with no rounds', () => {
    expect(computeStreak([], 7, 2, Date.now())).toBe(0)
  })
})

describe('helpers', () => {
  it('albumGoal ≈ rounds × picks', () => {
    expect(albumGoal(t(2026, 9, 1, 0), t(2026, 12, 1, 0), 7, 10)).toBe(130)
  })

  it('cadenceLabel', () => {
    expect(cadenceLabel(7)).toBe('Veckans urval')
    expect(cadenceLabel(30)).toBe('Månadens urval')
    expect(cadenceLabel(3)).toBe('Urval var 3:e dag')
  })

  it('formatRange within a month', () => {
    expect(formatRange(t(2026, 9, 21), t(2026, 9, 27))).toMatch(/^21–27 sep/)
  })

  it('isoWeek', () => {
    expect(isoWeek(t(2026, 9, 27))).toBe(39)
    expect(isoWeek(t(2027, 1, 1))).toBe(53)
  })
})
