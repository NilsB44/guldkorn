import { describe, expect, it } from 'vitest'
import { buildReminderIcs, nextOccurrence, rrule } from './calendar'
import { crossedMilestone } from './stats'

describe('calendar reminder', () => {
  const sat = new Date(2026, 8, 26, 10, 0) // Saturday

  it('finds the next weekday occurrence', () => {
    expect(nextOccurrence(0, '19:00', sat)).toEqual(new Date(2026, 8, 27, 19, 0))
    // Same weekday but time already passed → next week
    expect(nextOccurrence(6, '09:00', sat)).toEqual(new Date(2026, 9, 3, 9, 0))
  })

  it('builds recurrence rules', () => {
    expect(rrule(7)).toBe('FREQ=WEEKLY;INTERVAL=1')
    expect(rrule(14)).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(rrule(30)).toBe('FREQ=MONTHLY')
    expect(rrule(3)).toBe('FREQ=DAILY;INTERVAL=3')
  })

  it('produces a valid-looking VEVENT with an alarm', () => {
    const ics = buildReminderIcs({ appName: 'Guldkorn', appUrl: 'https://x.test/', title: 'Veckans urval', cadenceDays: 7, weekday: 0, time: '19:00', now: sat })
    expect(ics).toContain('DTSTART:20260927T190000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics.split('\r\n').at(-2)).toBe('END:VCALENDAR')
  })
})

describe('milestones', () => {
  it('detects the largest milestone crossed', () => {
    expect(crossedMilestone(0, 3)).toBe(1)
    expect(crossedMilestone(8, 12)).toBe(10)
    expect(crossedMilestone(11, 14)).toBeUndefined()
  })
})
