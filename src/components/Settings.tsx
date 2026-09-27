import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, BellRing, CalendarPlus, Download, Lock, Upload } from 'lucide-react'
import { config, type AlbumSize, type PickMode } from '../config'
import { clearAllData, db, saveSettings, useSettings } from '../db'
import { createBackup, restoreBackup } from '../lib/backup'
import { buildReminderIcs } from '../lib/calendar'
import { cadenceLabel, formatDateTime } from '../lib/dates'
import { currentPayload, disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push'
import { isIos, isStandalone } from '../lib/platform'
import { seedDemoData } from '../lib/demo'
import { shareFiles } from '../lib/share'
import { ConfirmButton, Header, Segmented } from './ui'

const WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
const showDevTools = import.meta.env.DEV || new URLSearchParams(location.search).has('dev')

export default function Settings() {
  const s = useSettings()
  const photoCount = useLiveQuery(() => db.photos.count(), [], 0)
  const [storage, setStorage] = useState<{ used: number; persisted: boolean }>()
  const [backup, setBackup] = useState<string | File>()
  const [message, setMessage] = useState('')

  async function refreshStorage() {
    const est = await navigator.storage?.estimate?.()
    const persisted = (await navigator.storage?.persisted?.()) ?? false
    setStorage({ used: est?.usage ?? 0, persisted })
  }
  useEffect(() => {
    refreshStorage()
  }, [photoCount])

  const customCadence = ![7, 14, 30].includes(s.cadenceDays)

  return (
    <div>
      <Header title="Inställningar" />
      <div className="space-y-6 px-5">
        <Section title="Ditt namn">
          <NameInput initial={s.name} />
        </Section>

        <Section title="Hur ofta vill du välja bilder?" hint={cadenceLabel(s.cadenceDays)}>
          <Segmented
            options={[
              { value: 7, label: 'Varje vecka' },
              { value: 14, label: 'Varannan' },
              { value: 30, label: 'Varje månad' },
              { value: -1, label: 'Eget' },
            ]}
            value={customCadence ? -1 : s.cadenceDays}
            onChange={(v) => saveSettings({ cadenceDays: v === -1 ? 3 : v })}
          />
          {customCadence && (
            <label className="mt-3 flex items-center justify-between rounded-xl border border-line bg-card px-4 py-2">
              Var
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="w-16 rounded-lg border border-line px-2 py-1 text-center"
                  value={s.cadenceDays}
                  onChange={(e) => saveSettings({ cadenceDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
                />
                dag
              </span>
            </label>
          )}
        </Section>

        <Section title="Bilder per urval" hint="Hur många guldkorn du siktar på varje gång.">
          <div className="flex items-center justify-between rounded-full border border-line bg-card p-1">
            <button className="h-10 w-10 rounded-full text-xl" onClick={() => saveSettings({ picksPerRound: Math.max(1, s.picksPerRound - 1) })}>
              −
            </button>
            <span className="font-serif text-xl">{s.picksPerRound}</span>
            <button className="h-10 w-10 rounded-full text-xl" onClick={() => saveSettings({ picksPerRound: Math.min(50, s.picksPerRound + 1) })}>
              +
            </button>
          </div>
        </Section>

        <Section title="Albumstorlek" hint="Guldkornen samlas automatiskt i album av den här storleken.">
          <Segmented<AlbumSize>
            options={[
              { value: 'month', label: 'Månad' },
              { value: 'season', label: 'Säsong' },
              { value: 'year', label: 'År' },
            ]}
            value={s.albumSize}
            onChange={(v) => saveSettings({ albumSize: v })}
          />
        </Section>

        <Section
          title="Så väljer du"
          hint={
            s.pickMode === 'swipe'
              ? 'Markera veckans bilder i bildväljaren (dra fingret över dem), sedan sveper du fram favoriterna.'
              : 'Välj dina favoriter direkt i bildväljaren – de sparas utan svepsteg.'
          }
        >
          <Segmented<PickMode>
            options={[
              { value: 'swipe', label: 'Svep (roligt)' },
              { value: 'direct', label: 'Direkt (snabbt)' },
            ]}
            value={s.pickMode}
            onChange={(v) => saveSettings({ pickMode: v })}
          />
        </Section>

        <Section title="Påminnelse">
          <div className="flex gap-2">
            <select className="flex-1 rounded-xl border border-line bg-card px-3 py-3" value={s.reminderWeekday} onChange={(e) => saveSettings({ reminderWeekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input type="time" className="rounded-xl border border-line bg-card px-3 py-3" value={s.reminderTime} onChange={(e) => saveSettings({ reminderTime: e.target.value || '19:00' })} />
          </div>
          <PushControls />
          <button
            className="btn-ghost mt-2 w-full text-sm"
            onClick={() => {
              const ics = buildReminderIcs({
                appName: config.appName,
                appUrl: location.origin + location.pathname,
                title: `${cadenceLabel(s.cadenceDays)} i ${config.appName}`,
                cadenceDays: s.cadenceDays,
                weekday: s.reminderWeekday,
                time: s.reminderTime,
              })
              shareFiles([new File([ics], 'guldkorn-paminnelse.ics', { type: 'text/calendar' })], 'Påminnelse')
            }}
          >
            <CalendarPlus size={16} /> Lägg till i kalendern i stället
          </button>
        </Section>

        <Section title="Integritet">
          <div className="card space-y-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Lock size={16} className="text-keep" /> Allt stannar i din telefon
            </p>
            <p className="text-muted">
              Bilderna sparas bara här i appen. Inget skickas till någon server, det finns inga konton och ingen spårning. Platsinformation tas bort när bilderna sparas.
            </p>
            {storage && (
              <p className="text-muted">
                {photoCount} guldkorn · {(storage.used / 1024 / 1024).toFixed(0)} MB använt ·{' '}
                {storage.persisted ? 'lagringen är skyddad ✓' : 'lagringen är inte skyddad'}
              </p>
            )}
          </div>
        </Section>

        <Section title="Säkerhetskopia" hint="Eftersom allt bara finns i telefonen — spara en kopia ibland, t.ex. i Filer/iCloud Drive.">
          <div className="flex gap-2">
            {backup instanceof File ? (
              <button className="btn-primary flex-1" onClick={async () => (await shareFiles([backup], 'Guldkorn-säkerhetskopia')) !== 'cancelled' && setBackup(undefined)}>
                <Download size={18} /> Spara kopian
              </button>
            ) : (
              <button
                className="btn-secondary flex-1"
                disabled={!!backup}
                onClick={async () => {
                  setBackup('Förbereder…')
                  const blob = await createBackup((d, t) => setBackup(`${d} / ${t}`))
                  const date = new Date().toISOString().slice(0, 10)
                  setBackup(new File([blob], `guldkorn-${date}.zip`, { type: 'application/zip' }))
                }}
              >
                <Download size={18} /> {backup ?? 'Skapa kopia'}
              </button>
            )}
            <label className="btn-secondary flex-1 cursor-pointer">
              <Upload size={18} /> Återställ
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setMessage('Återställer…')
                  try {
                    setMessage(`${await restoreBackup(file)} bilder återställda ✓`)
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : 'Kunde inte läsa filen.')
                  }
                }}
              />
            </label>
          </div>
          {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        </Section>

        {showDevTools && (
          <Section title="Utvecklare" hint="Syns bara i dev-läge eller med ?dev i adressen.">
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={async () => (setMessage('Skapar testbilder…'), await seedDemoData(), setMessage('Testdata tillagd ✓'))}>
                Fyll med testbilder
              </button>
            </div>
          </Section>
        )}

        <Section title="Rensa">
          <ConfirmButton className="btn-secondary w-full !text-skip" confirmText="Radera ALLT för gott?" onConfirm={() => clearAllData()}>
            Radera alla bilder och album
          </ConfirmButton>
        </Section>

        <p className="pb-4 text-center text-xs text-muted">
          {config.appName} · gjord med kärlek ♥
        </p>
      </div>
    </div>
  )
}

const isBrave = () => 'brave' in navigator

function pushInfo(state: PushState): string {
  switch (state) {
    case 'install-first':
      return 'Lägg till appen på hemskärmen och öppna den därifrån för att kunna få notiser.'
    case 'unsupported':
      return 'Den här webbläsaren kan inte ta emot notiser.'
    case 'denied':
      if (isIos()) return 'Notiser är blockerade. Slå på dem i iPhone-inställningar → Notiser → Guldkorn.'
      if (isBrave())
        return 'Notiser är blockerade. I Brave: Inställningar → Integritet och säkerhet → slå på ”Använd Googles tjänster för push-meddelanden”, starta om Brave. Kolla även Webbplatsinställningar → Aviseringar.'
      return 'Notiser är blockerade för den här sidan. Återställ i webbläsarens Webbplatsinställningar → Aviseringar (och kolla att webbläsaren får visa aviseringar i Android-inställningarna).'
    default:
      return ''
  }
}

/** Raw facts for troubleshooting on a real phone. */
function PushDiagnostics() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    ;(async () => {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
      setLines([
        `Webbläsare: ${isBrave() ? 'Brave' : navigator.userAgent.match(/(CriOS|Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? '?'}${isIos() ? ' (iOS)' : ''}`,
        `Hemskärmsläge: ${isStandalone() ? 'ja' : 'nej'}`,
        `Notisbehörighet: ${'Notification' in window ? Notification.permission : 'saknas'}`,
        `Service worker: ${reg ? (reg.active ? 'aktiv' : 'installeras') : 'saknas'}`,
        `Push-stöd: ${'PushManager' in window ? 'ja' : 'nej'} · prenumeration: ${(await reg?.pushManager?.getSubscription()) ? 'ja' : 'nej'}`,
        `Säker anslutning: ${isSecureContext ? 'ja' : 'nej (http)'}`,
      ])
    })()
  }, [])
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer">Felsökning</summary>
      <ul className="mt-2 space-y-0.5 font-mono">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  )
}

function PushControls() {
  const [state, setState] = useState<PushState>()
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const settings = useSettings()
  const next = useLiveQuery(async () => (state === 'on' ? (await currentPayload()).nextAt : undefined), [state, settings])

  useEffect(() => {
    pushState().then(setState)
  }, [])

  const run = (fn: () => Promise<unknown>, done?: string) => async () => {
    setBusy(true)
    setInfo('')
    try {
      await fn()
      if (done) setInfo(done)
    } catch (err) {
      setInfo(err instanceof Error ? err.message : String(err))
    }
    setState(await pushState())
    setBusy(false)
  }

  if (!state || state === 'unconfigured') return null
  return (
    <div className="card mt-3 space-y-3 p-4">
      {state === 'on' ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <BellRing size={16} className="text-keep" /> Påminnelser är på
          </p>
          {next && <p className="text-sm text-muted">Nästa: {formatDateTime(next)}</p>}
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 py-2 text-sm" disabled={busy} onClick={run(sendTestPush, 'Testnotis skickad – den kommer om några sekunder.')}>
              Skicka testnotis
            </button>
            <button className="btn-ghost py-2 text-sm" disabled={busy} onClick={run(disablePush)}>
              Stäng av
            </button>
          </div>
        </>
      ) : state === 'off' ? (
        <button className="btn-primary w-full" disabled={busy} onClick={run(enablePush, 'Klart! Du får en notis när det är dags.')}>
          <Bell size={18} /> Slå på påminnelser
        </button>
      ) : (
        <>
          <p className="text-sm text-muted">{pushInfo(state)}</p>
          {state === 'denied' && (
            <button className="btn-secondary w-full py-2 text-sm" onClick={async () => setState(await pushState())}>
              Jag har ändrat – kolla igen
            </button>
          )}
        </>
      )}
      {info && <p className="text-sm text-muted">{info}</p>}
      <PushDiagnostics key={state} />
    </div>
  )
}

// Local state so typing isn't interrupted by the async database round-trip.
function NameInput({ initial }: { initial: string }) {
  const [value, setValue] = useState<string>()
  return (
    <input
      className="w-full rounded-xl border border-line bg-card px-3 py-3"
      placeholder="Visas som ”Hej …” på startsidan"
      value={value ?? initial}
      onChange={(e) => {
        setValue(e.target.value)
        saveSettings({ name: e.target.value })
      }}
    />
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="label mb-2">{title}</p>
      {children}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </section>
  )
}
