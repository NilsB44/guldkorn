// Guldkorn push server — a Cloudflare Worker whose only job is to send
// "time to pick your photos" reminders at the time the app asked for.
//
// Stores per phone: the anonymous push subscription (a URL at Apple/Google + keys),
// the time of the next reminder and the reminder text. No photos, no names, no accounts.
//
//   GET    /vapid          → public key the app needs to subscribe
//   PUT    /subscription   → create/update { subscription, nextAt, repeatDays, title, body }
//   DELETE /subscription   → { endpoint }
//   POST   /test           → { endpoint } sends a test notification right away
//   cron (every 15 min)    → sends reminders that are due

import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push'
import { advance, isPushEndpoint, keyFor, parseSubscription, type StoredSubscription } from './logic'

interface Env {
  SUBS: KVNamespace
  ALLOWED_ORIGIN: string // e.g. https://nilsb44.github.io
  VAPID_SUBJECT: string // mailto:you@example.com — lets Apple/Google contact you
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string // secret
}

const MAX_SUBSCRIPTIONS = 20 // it's a private app; keeps abuse cheap to ignore
const MAX_BODY = 4096

function cors(env: Env, origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN.split(',').map((s) => s.trim())
  return origin && allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, PUT, POST, DELETE', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
    : { vary: 'origin' }
}

async function send(env: Env, record: StoredSubscription, data: { title: string; body: string }): Promise<number> {
  const vapid: VapidKeys = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  const payload = await buildPushPayload({ data, options: { ttl: 12 * 60 * 60, urgency: 'normal', topic: 'reminder' } }, record.subscription, vapid)
  const res = await fetch(record.subscription.endpoint, payload)
  return res.status
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.length > MAX_BODY) throw new Error('too large')
  return JSON.parse(text)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin')
    const headers: Record<string, string> = { ...cors(env, origin), 'content-type': 'application/json', 'cache-control': 'no-store' }
    const reply = (status: number, body: unknown = { ok: status < 300 }) => new Response(JSON.stringify(body), { status, headers })

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    // Browsers only: requests must come from the app's own site.
    if (!headers['access-control-allow-origin']) return reply(403, { error: 'origin not allowed' })

    const { pathname } = new URL(req.url)
    try {
      if (req.method === 'GET' && pathname === '/vapid') return reply(200, { publicKey: env.VAPID_PUBLIC_KEY })

      if (req.method === 'PUT' && pathname === '/subscription') {
        const record = parseSubscription(await readJson(req), Date.now())
        if (typeof record === 'string') return reply(400, { error: record })
        const key = await keyFor(record.subscription.endpoint)
        const existing = await env.SUBS.get<StoredSubscription>(key, 'json')
        if (!existing && (await env.SUBS.list({ prefix: 'sub:' })).keys.length >= MAX_SUBSCRIPTIONS) return reply(429, { error: 'full' })
        await env.SUBS.put(key, JSON.stringify({ ...record, lastTestAt: existing?.lastTestAt }))
        return reply(200, { ok: true, nextAt: record.nextAt })
      }

      if (req.method === 'DELETE' && pathname === '/subscription') {
        const { endpoint } = (await readJson(req)) as { endpoint?: unknown }
        if (!isPushEndpoint(endpoint)) return reply(400, { error: 'invalid endpoint' })
        await env.SUBS.delete(await keyFor(endpoint))
        return reply(200)
      }

      if (req.method === 'POST' && pathname === '/test') {
        const { endpoint } = (await readJson(req)) as { endpoint?: unknown }
        if (!isPushEndpoint(endpoint)) return reply(400, { error: 'invalid endpoint' })
        const key = await keyFor(endpoint)
        const record = await env.SUBS.get<StoredSubscription>(key, 'json')
        if (!record) return reply(404, { error: 'not subscribed' })
        if (record.lastTestAt && Date.now() - record.lastTestAt < 30_000) return reply(429, { error: 'wait a moment' })
        await env.SUBS.put(key, JSON.stringify({ ...record, lastTestAt: Date.now() }))
        const status = await send(env, record, { title: 'Det funkar! 🎉', body: 'Så här kommer påminnelserna att se ut.' })
        return reply(status < 300 ? 200 : 502, { ok: status < 300, pushStatus: status })
      }

      return reply(404, { error: 'not found' })
    } catch (err) {
      return reply(400, { error: err instanceof Error ? err.message : 'bad request' })
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = Date.now()
    const { keys } = await env.SUBS.list({ prefix: 'sub:' })
    for (const { name } of keys) {
      const record = await env.SUBS.get<StoredSubscription>(name, 'json')
      if (!record || record.nextAt > now) continue
      try {
        const status = await send(env, record, { title: record.title, body: record.body })
        if (status === 404 || status === 410) {
          // The phone unsubscribed or the app was removed — forget it.
          await env.SUBS.delete(name)
          continue
        }
        console.log(`reminder sent (${status})`)
      } catch (err) {
        console.error('push failed', err)
      }
      await env.SUBS.put(name, JSON.stringify({ ...record, nextAt: advance(record.nextAt, record.repeatDays, now) }))
    }
  },
} satisfies ExportedHandler<Env>
