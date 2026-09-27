// Push reminders via the tiny Worker in /push-server.
// What the server gets: the phone's anonymous push address + when to send the next
// reminder + its text. Never photos, names or anything else.

import { config } from '../config'
import { db, getSettings, type Settings } from '../db'
import { cadenceLabel, nextReminderAt, roundStatus } from './dates'
import { isIos, isStandalone } from './platform'

export type PushState = 'unconfigured' | 'install-first' | 'unsupported' | 'denied' | 'off' | 'on'

const base = config.pushServerUrl.replace(/\/+$/, '')

export interface ReminderPayload {
  nextAt: number
  repeatDays: number
  title: string
  body: string
}

export function reminderPayload(settings: Settings, lastPeriodEnd: number | undefined, now: number): ReminderPayload {
  const reminder = { weekday: settings.reminderWeekday, time: settings.reminderTime }
  const status = roundStatus(lastPeriodEnd, settings.cadenceDays, now, reminder)
  const period = settings.cadenceDays === 7 ? 'veckan' : settings.cadenceDays >= 28 ? 'månaden' : 'de senaste dagarna'
  return {
    nextAt: nextReminderAt(status, settings.cadenceDays, reminder, now),
    repeatDays: Math.min(7, settings.cadenceDays),
    title: `${cadenceLabel(settings.cadenceDays)} ✨`,
    body: `Dags att välja dina bästa bilder från ${period}!`,
  }
}

/** Builds the payload from what's in the database right now. */
export async function currentPayload(now = Date.now()): Promise<ReminderPayload> {
  const last = await db.rounds.orderBy('completedAt').last()
  return reminderPayload(await getSettings(), last?.periodEnd, now)
}

async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Servern svarade ${res.status}`)
  return json as T
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager?.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!base) return 'unconfigured'
  // iPhone only allows notifications for apps added to the home screen.
  if (isIos() && !isStandalone()) return 'install-first'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSubscription()) ? 'on' : 'off'
}

/** Must be called straight from a tap (iOS requires a user gesture for the permission prompt). */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Du behöver tillåta notiser för att få påminnelser.')
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Appen är inte helt installerad än – öppna den via https-länken.')), 8000)),
  ])
  const { publicKey } = await api<{ publicKey: string }>('GET', '/vapid')
  let subscription: PushSubscription
  try {
    subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }))
  } catch (err) {
    // Typical in Brave (Google push service switched off): "push service not available".
    const hint = 'brave' in navigator ? ' I Brave: slå på ”Använd Googles tjänster för push-meddelanden” under Integritet och säkerhet.' : ''
    throw new Error(`Kunde inte registrera notiser (${err instanceof Error ? err.message : err}).${hint}`)
  }
  await api('PUT', '/subscription', { subscription: subscription.toJSON(), ...(await currentPayload()) })
}

/** Tells the server when the next reminder is due. Call whenever schedule or rounds change. */
export async function syncPush(): Promise<boolean> {
  if (!base) return false
  const subscription = await currentSubscription()
  if (!subscription) return false
  await api('PUT', '/subscription', { subscription: subscription.toJSON(), ...(await currentPayload()) })
  return true
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe()
  await api('DELETE', '/subscription', { endpoint }).catch(() => {})
}

export async function sendTestPush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) throw new Error('Påminnelser är inte påslagna.')
  await api('POST', '/test', { endpoint: subscription.endpoint })
}
