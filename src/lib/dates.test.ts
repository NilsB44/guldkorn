import { describe, expect, it } from 'vitest'
import { albumGoal, albumRange, cadenceLabel, computeStreak, DAY, formatRange, isoWeek, roundStatus } from './dates'

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
