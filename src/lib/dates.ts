import type { AlbumSize } from '../config'

export const DAY = 24 * 60 * 60 * 1000

export function startOfDay(t: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function addDays(t: number, days: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const SEASONS = [
  { name: 'Vintern', emoji: '❄️', firstMonth: 11 },
  { name: 'Våren', emoji: '🌷', firstMonth: 2 },
  { name: 'Sommaren', emoji: '☀️', firstMonth: 5 },
  { name: 'Hösten', emoji: '🍁', firstMonth: 8 },
]

export function seasonOf(month: number) {
  return SEASONS[Math.floor(((month + 1) % 12) / 3)]
}

export interface AlbumRange {
  name: string
  emoji: string
  start: number
  end: number
}

/** The month / season / year album that contains time t. */
export function albumRange(size: AlbumSize, t: number): AlbumRange {
  const d = new Date(t)
  const y = d.getFullYear()
  const m = d.getMonth()
  switch (size) {
    case 'month': {
      const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long' }).format(d)
      return {
        name: `${capitalize(monthName)} ${y}`,
        emoji: seasonOf(m).emoji,
        start: new Date(y, m, 1).getTime(),
        end: new Date(y, m + 1, 1).getTime(),
      }
    }
    case 'season': {
      const season = seasonOf(m)
      // Winter starts in December, so Jan/Feb belong to the previous year's winter.
      const startYear = season.firstMonth === 11 && m < 11 ? y - 1 : y
      const start = new Date(startYear, season.firstMonth, 1)
      const label = season.firstMonth === 11 ? `${startYear}/${String(startYear + 1).slice(2)}` : `${startYear}`
      return {
        name: `${season.name} ${label}`,
        emoji: season.emoji,
        start: start.getTime(),
        end: new Date(startYear, season.firstMonth + 3, 1).getTime(),
      }
    }
    case 'year':
      return { name: `Året ${y}`, emoji: '✨', start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime() }
  }
}

export interface RoundStatus {
  periodStart: number
  dueAt: number
  isDue: boolean
  daysLeft: number
  isFirst: boolean
}

/** When the next "urval" is due, and which period of photos it covers. */
export function roundStatus(lastPeriodEnd: number | undefined, cadenceDays: number, now: number): RoundStatus {
  if (lastPeriodEnd === undefined) {
    return { periodStart: startOfDay(addDays(now, -cadenceDays)), dueAt: now, isDue: true, daysLeft: 0, isFirst: true }
  }
  const dueAt = addDays(startOfDay(lastPeriodEnd), cadenceDays)
  return {
    periodStart: lastPeriodEnd,
    dueAt,
    isDue: now >= dueAt,
    daysLeft: Math.max(0, Math.ceil((dueAt - now) / DAY)),
    isFirst: false,
  }
}

/** Number of rounds in a row completed roughly on schedule. 0 if the chain is broken. */
export function computeStreak(completedAts: number[], cadenceDays: number, graceDays: number, now: number): number {
  if (completedAts.length === 0) return 0
  const sorted = [...completedAts].sort((a, b) => a - b)
  const maxGap = (cadenceDays + graceDays) * DAY
  let i = sorted.length - 1
  if (now - sorted[i] > maxGap) return 0
  let streak = 1
  while (i > 0 && sorted[i] - sorted[i - 1] <= maxGap) {
    streak++
    i--
  }
  return streak
}

/** Rough "how many photos will this album hold" target, for the progress bar. */
export function albumGoal(start: number, end: number, cadenceDays: number, picksPerRound: number): number {
  const rounds = Math.max(1, Math.round((end - start) / DAY / cadenceDays))
  return rounds * picksPerRound
}

export function cadenceLabel(cadenceDays: number): string {
  if (cadenceDays === 7) return 'Veckans urval'
  if (cadenceDays === 14) return 'Urval varannan vecka'
  if (cadenceDays >= 28 && cadenceDays <= 31) return 'Månadens urval'
  if (cadenceDays === 1) return 'Dagens urval'
  return `Urval var ${cadenceDays}:e dag`
}

export function cadenceUnit(cadenceDays: number, count: number): string {
  if (cadenceDays === 7) return count === 1 ? 'vecka' : 'veckor'
  if (cadenceDays >= 28 && cadenceDays <= 31) return count === 1 ? 'månad' : 'månader'
  return count === 1 ? 'omgång' : 'omgångar'
}

const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

/** "21–27 sep." style range. `end` is exclusive when `exclusiveEnd` is true. */
export function formatRange(start: number, end: number, exclusiveEnd = false): string {
  const last = exclusiveEnd ? end - 1 : end
  const a = new Date(start)
  const b = new Date(last)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    if (a.getDate() === b.getDate()) return dayMonth.format(a)
    return `${a.getDate()}–${dayMonth.format(b)}`
  }
  return `${dayMonth.format(a)} – ${dayMonth.format(b)}`
}

export function formatDate(t: number): string {
  return fullDate.format(t)
}

export function formatToday(t: number): string {
  return capitalize(new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(t))
}

/** ISO week number, used to group photos in album view. */
export function isoWeek(t: number): number {
  const d = new Date(t)
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

/** Value for <input type="date">. */
export function toDateInput(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromDateInput(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
