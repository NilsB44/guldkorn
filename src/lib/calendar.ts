// Recurring reminder as a calendar event (.ics), generated on the phone.
// Web push notifications would need a server; a calendar alarm needs nothing.

const pad = (n: number) => String(n).padStart(2, '0')

function icsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Next date (from `now`, today included if the time hasn't passed) on the given weekday and time. */
export function nextOccurrence(weekday: number, time: string, now: Date): Date {
  const [h, min] = time.split(':').map(Number)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min)
  let add = (weekday - d.getDay() + 7) % 7
  if (add === 0 && d.getTime() <= now.getTime()) add = 7
  d.setDate(d.getDate() + add)
  return d
}

export function rrule(cadenceDays: number): string {
  if (cadenceDays % 7 === 0) return `FREQ=WEEKLY;INTERVAL=${cadenceDays / 7}`
  if (cadenceDays >= 28 && cadenceDays <= 31) return 'FREQ=MONTHLY'
  return `FREQ=DAILY;INTERVAL=${cadenceDays}`
}

export function buildReminderIcs(opts: {
  appName: string
  appUrl: string
  title: string
  cadenceDays: number
  weekday: number
  time: string
  now?: Date
}): string {
  const now = opts.now ?? new Date()
  const start = nextOccurrence(opts.weekday, opts.time, now)
  const end = new Date(start.getTime() + 15 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${opts.appName}//SV`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${opts.appName.toLowerCase()}-reminder@local`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsLocal(start)}`,
    `DTEND:${icsLocal(end)}`,
    `RRULE:${rrule(opts.cadenceDays)}`,
    `SUMMARY:✨ ${opts.title}`,
    `DESCRIPTION:Öppna ${opts.appName} och välj dina bästa bilder.`,
    `URL:${opts.appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:${opts.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
