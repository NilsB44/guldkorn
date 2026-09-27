import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Share, Sparkles, ChevronRight } from 'lucide-react'
import { config } from '../config'
import { db, photosInRange, useSettings } from '../db'
import { ensureAlbums, findAutoAlbum } from '../lib/albums'
import { albumGoal, albumRange, cadenceLabel, cadenceUnit, computeStreak, formatRange, formatToday, roundStatus } from '../lib/dates'
import type { Go } from '../nav'
import { isIos, isStandalone } from '../lib/platform'
import { ProgressBar, Thumb } from './ui'

export default function Home({ go }: { go: Go }) {
  const settings = useSettings()
  const now = Date.now()
  const rounds = useLiveQuery(() => db.rounds.orderBy('completedAt').toArray(), [], [])
  const totalPhotos = useLiveQuery(() => db.photos.count(), [], 0)

  const range = albumRange(settings.albumSize, now)
  const albumPhotos = useLiveQuery(() => photosInRange(range.start, range.end).reverse().toArray(), [range.start, range.end], [])
  const album = useLiveQuery(() => findAutoAlbum(settings.albumSize, range.start), [settings.albumSize, range.start])
  useEffect(() => {
    ensureAlbums(settings.albumSize, [Date.now()])
  }, [settings.albumSize])

  const lastEnd = rounds.length ? Math.max(...rounds.map((r) => r.periodEnd)) : undefined
  const status = roundStatus(lastEnd, settings.cadenceDays, now, { weekday: settings.reminderWeekday, time: settings.reminderTime })
  const nextText =
    status.daysLeft === 0 ? `Nästa urval idag kl ${settings.reminderTime}` : status.daysLeft === 1 ? 'Nästa urval imorgon' : `Nästa urval om ${status.daysLeft} dagar`
  const streak = computeStreak(rounds.map((r) => r.completedAt), settings.cadenceDays, config.streakGraceDays, now)
  const goal = albumGoal(range.start, range.end, settings.cadenceDays, settings.picksPerRound)
  const label = cadenceLabel(settings.cadenceDays)

  useEffect(() => {
    document.title = status.isDue ? `(1) ${config.appName}` : config.appName
  }, [status.isDue])

  return (
    <div className="space-y-5 px-5">
      <header className="pt-safe">
        <p className="text-sm text-muted">{formatToday(now)}</p>
        <h1 className="title mt-1">{settings.name ? `Hej ${settings.name}` : config.appName}</h1>
      </header>

      {isIos() && !isStandalone() && <InstallHint />}

      {/* Round card */}
      <section className={`rounded-card p-6 ${status.isDue ? 'bg-accent text-accent-ink shadow-lg shadow-accent/20' : 'card'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`label ${status.isDue ? '!text-accent-ink/80' : ''}`}>{label}</p>
            <h2 className="mt-2 font-serif text-2xl leading-tight">
              {status.isFirst
                ? 'Välj dina första guldkorn'
                : status.isDue
                  ? `Dags att välja! ✨`
                  : nextText}
            </h2>
          </div>
          {streak > 0 && (
            <span className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${status.isDue ? 'bg-white/20' : 'bg-accent-soft text-accent'}`}>
              <Flame size={16} /> {streak}
            </span>
          )}
        </div>
        <p className={`mt-2 text-sm ${status.isDue ? 'text-accent-ink/85' : 'text-muted'}`}>
          {status.isDue
            ? `Plocka ut dina ${settings.picksPerRound} bästa bilder från ${formatRange(status.periodStart, now)}`
            : streak > 0
              ? `${streak} ${cadenceUnit(settings.cadenceDays, streak)} i rad — fortsätt så!`
              : 'Du kan alltid göra ett extra urval.'}
        </p>
        <button
          onClick={() => go({ name: 'round' })}
          className={`btn-secondary mt-5 w-full ${status.isDue ? '!border-transparent shadow-sm' : ''}`}
        >
          <Sparkles size={18} /> {status.isDue ? 'Starta urvalet' : 'Gör ett extra urval'}
        </button>
      </section>

      {/* Current album */}
      <button onClick={() => album && go({ name: 'album', id: album.id })} className="card block w-full p-5 text-left">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">Pågående album</p>
            <h2 className="mt-1 font-serif text-xl">
              {range.emoji} {range.name}
            </h2>
          </div>
          <ChevronRight className="text-muted" />
        </div>
        <Mosaic photos={albumPhotos.slice(0, 5)} />
        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span>
            <strong className="font-serif text-lg">{albumPhotos.length}</strong> guldkorn
          </span>
          <span className="text-muted">mål {goal}</span>
        </div>
        <ProgressBar value={albumPhotos.length / goal} className="mt-2" />
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Stat value={totalPhotos} label="guldkorn totalt" />
        <Stat value={rounds.length} label="urval gjorda" />
      </div>
    </div>
  )
}

function Mosaic({ photos }: { photos: Parameters<typeof Thumb>[0]['photo'][] }) {
  if (photos.length === 0) {
    return (
      <div className="mt-4 flex h-32 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">
        Albumet fylls på när du gör ditt första urval
      </div>
    )
  }
  const [first, ...rest] = photos
  return (
    <div className="mt-4 grid h-40 grid-cols-3 grid-rows-2 gap-1.5 overflow-hidden rounded-2xl">
      <Thumb photo={first} className={`h-full w-full ${rest.length ? 'col-span-2 row-span-2' : 'col-span-3 row-span-2'}`} />
      {rest.slice(0, 2).map((p, i) => (
        <Thumb key={i} photo={p} className={`h-full w-full ${rest.length === 1 ? 'row-span-2' : ''}`} />
      ))}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="card p-4">
      <p className="font-serif text-2xl">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function InstallHint() {
  return (
    <div className="rounded-card border border-accent/30 bg-accent-soft p-4 text-sm">
      <p className="font-medium">Lägg appen på hemskärmen först 📲</p>
      <p className="mt-1 text-muted">
        Tryck på <Share size={14} className="inline -mt-1" /> <strong>Dela</strong> i Safari och välj <strong>Lägg till på hemskärmen</strong>. Öppna
        sedan appen därifrån — bilder som sparas här i Safari syns inte i hemskärmsappen.
      </p>
    </div>
  )
}
