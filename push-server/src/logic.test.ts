import { describe, expect, it } from 'vitest'
import { advance, DAY, isPushEndpoint, keyFor, parseSubscription } from './logic'

const now = Date.UTC(2026, 8, 27, 12)
const valid = {
  subscription: { endpoint: 'https://web.push.apple.com/QGx1c2VyLXRva2Vu', expirationTime: null, keys: { auth: 'aGVsbG8td29ybGQ', p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM' } },
  nextAt: now + DAY,
  repeatDays: 7,
  title: 'Veckans urval ✨',
  body: 'Dags att välja!',
}

describe('isPushEndpoint', () => {
  it('accepts real push services', () => {
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isPushEndpoint('http://web.push.apple.com/abc')).toBe(false)
    expect(isPushEndpoint('https://evil.example.com/web.push.apple.com')).toBe(false)
    expect(isPushEndpoint('https://web.push.apple.com.evil.com/')).toBe(false)
    expect(isPushEndpoint(42)).toBe(false)
  })
})

describe('parseSubscription', () => {
  it('accepts a valid body', () => {
    const r = parseSubscription(valid, now)
    expect(typeof r).toBe('object')
    expect(r).toMatchObject({ nextAt: now + DAY, repeatDays: 7, title: 'Veckans urval ✨' })
  })
  it('rejects bad input', () => {
    expect(parseSubscription(null, now)).toBe('invalid body')
    expect(parseSubscription({ ...valid, nextAt: now + 200 * DAY }, now)).toBe('invalid nextAt')
    expect(parseSubscription({ ...valid, repeatDays: 0 }, now)).toBe('invalid repeatDays')
    expect(parseSubscription({ ...valid, subscription: { ...valid.subscription, keys: { auth: '<script>', p256dh: 'x' } } }, now)).toBe('invalid keys')
  })
  it('truncates long texts', () => {
    const r = parseSubscription({ ...valid, body: 'x'.repeat(500) }, now)
    expect(typeof r === 'object' && r.body.length).toBe(120)
  })
})

describe('advance', () => {
  it('moves the reminder into the future in repeatDays steps', () => {
    expect(advance(now - 1000, 7, now)).toBe(now - 1000 + 7 * DAY)
    expect(advance(now - 15 * DAY, 7, now)).toBe(now - 15 * DAY + 21 * DAY)
  })
})

describe('keyFor', () => {
  it('is stable and does not contain the endpoint', async () => {
    const k = await keyFor('https://web.push.apple.com/abc')
    expect(k).toBe(await keyFor('https://web.push.apple.com/abc'))
    expect(k).toMatch(/^sub:[0-9a-f]{64}$/)
  })
})
