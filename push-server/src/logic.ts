// Pure helpers (unit-tested in logic.test.ts).

export const DAY = 24 * 60 * 60 * 1000

export interface StoredSubscription {
  subscription: {
    endpoint: string
    expirationTime: number | null
    keys: { auth: string; p256dh: string }
  }
  nextAt: number // when the next reminder should go out (ms since epoch, UTC)
  repeatDays: number // if she doesn't react, remind again this many days later
  title: string
  body: string
  updatedAt: number
  lastTestAt?: number
}

// Only real browser push services may be registered, so the Worker can't be
// abused to make requests to arbitrary URLs.
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/]

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}

const isB64url = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max && /^[A-Za-z0-9_-]+=*$/.test(s)
const cleanText = (s: unknown, fallback: string) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 120) : fallback)

/** Validates the body of PUT /subscription. Returns an error message or the record to store. */
export function parseSubscription(body: unknown, now: number): StoredSubscription | string {
  if (!body || typeof body !== 'object') return 'invalid body'
  const b = body as Record<string, unknown>
  const sub = b.subscription as Record<string, unknown> | undefined
  const keys = sub?.keys as Record<string, unknown> | undefined
  if (!sub || !isPushEndpoint(sub.endpoint)) return 'invalid endpoint'
  if (!keys || !isB64url(keys.auth, 64) || !isB64url(keys.p256dh, 128)) return 'invalid keys'
  const nextAt = Number(b.nextAt)
  if (!Number.isFinite(nextAt) || nextAt < now - DAY || nextAt > now + 100 * DAY) return 'invalid nextAt'
  const repeatDays = Number(b.repeatDays)
  if (!Number.isInteger(repeatDays) || repeatDays < 1 || repeatDays > 31) return 'invalid repeatDays'
  return {
    subscription: {
      endpoint: sub.endpoint,
      expirationTime: typeof sub.expirationTime === 'number' ? sub.expirationTime : null,
      keys: { auth: keys.auth, p256dh: keys.p256dh },
    },
    nextAt,
    repeatDays,
    title: cleanText(b.title, 'Guldkorn ✨'),
    body: cleanText(b.body, 'Dags att välja dina bästa bilder!'),
    updatedAt: now,
  }
}

/** After sending, the next reminder is `repeatDays` later (the app overrides this whenever it's opened). */
export function advance(nextAt: number, repeatDays: number, now: number): number {
  let next = nextAt
  while (next <= now) next += repeatDays * DAY
  return next
}

export async function keyFor(endpoint: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return 'sub:' + Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
}
