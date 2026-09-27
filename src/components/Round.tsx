import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import confetti from 'canvas-confetti'
import { Check, Heart, ImagePlus, Loader2, Undo2, X } from 'lucide-react'
import { config } from '../config'
import { db, newId, useSettings } from '../db'
import { ensureAlbums, findAutoAlbum } from '../lib/albums'
import { albumRange, cadenceLabel, cadenceUnit, computeStreak, formatDate, formatRange, roundStatus } from '../lib/dates'
import { processPhoto, readMeta, type PhotoMeta } from '../lib/images'
import { cheer, crossedMilestone, milestoneText } from '../lib/stats'
import type { Go } from '../nav'
import { ConfirmButton, ProgressBar } from './ui'

interface Candidate extends PhotoMeta {
  key: string
  file: File
  url: string
  inPeriod: boolean
}

type Step = 'pick' | 'loading' | 'swipe' | 'review' | 'saving' | 'done'

interface Result {
  kept: number
  streak: number
  milestone?: number
  albumId?: string
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

export default function Round({ go, onClose }: { go: Go; onClose: () => void }) {
  const settings = useSettings()
  const [now] = useState(Date.now)
  const rounds = useLiveQuery(() => db.rounds.toArray(), [])
  const lastEnd = rounds?.length ? Math.max(...rounds.map((r) => r.periodEnd)) : undefined
  const status = roundStatus(lastEnd, settings.cadenceDays, now)
  const target = settings.picksPerRound

  const [step, setStep] = useState<Step>('pick')
  const [notice, setNotice] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [index, setIndex] = useState(0)
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [decided, setDecided] = useState<string[]>([])
  const [goalReached, setGoalReached] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Result>()

  // Free the object URLs when leaving the flow.
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setStep('loading')
    setNotice('')
    const metas = await mapLimit(files, 4, readMeta)
    const saved = new Set(
      (await db.photos.where('fingerprint').anyOf(metas.map((m) => m.fingerprint)).toArray()).map((p) => p.fingerprint),
    )
    const fresh = files
      .map((file, i) => ({ file, ...metas[i] }))
      .filter((c) => !saved.has(c.fingerprint))
      .sort((a, b) => a.takenAt - b.takenAt)
      .map((c, i) => {
        const url = URL.createObjectURL(c.file)
        urls.current.push(url)
        return { ...c, key: `${i}-${c.fingerprint}`, url, inPeriod: c.takenAt >= status.periodStart - 86400000 }
      })
    const dupes = files.length - fresh.length
    if (dupes) setNotice(`${dupes} ${dupes === 1 ? 'bild var' : 'bilder var'} redan sparade och hoppas över.`)
    if (!fresh.length) return setStep('pick')
    setCandidates(fresh)
    setIndex(0)
    setKept(new Set())
    setDecided([])
    setStep('swipe')
  }

  function decide(keep: boolean) {
    const c = candidates[index]
    if (!c) return
    const nextKept = new Set(kept)
    if (keep) nextKept.add(c.key)
    setKept(nextKept)
    setDecided([...decided, c.key])
    if (keep && nextKept.size === target && !goalReached) {
      setGoalReached(true)
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 }, colors: ['#c8963e', '#f5ead6', '#6b9e7a'] })
    }
    if (index + 1 >= candidates.length) setStep('review')
    else setIndex(index + 1)
  }

  function undo() {
    const last = decided.at(-1)
    if (!last) return
    const nextKept = new Set(kept)
    nextKept.delete(last)
    setKept(nextKept)
    setDecided(decided.slice(0, -1))
    setIndex(Math.max(0, index - 1))
  }

  function toggle(key: string) {
    const next = new Set(kept)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setKept(next)
  }

  async function save() {
    setStep('saving')
    setProgress(0)
    setNotice('')
    try {
      await saveChosen()
    } catch (err) {
      console.error(err)
      setNotice(`Något gick fel när bilderna sparades (${err instanceof Error ? err.message : err}). Försök igen.`)
      setStep('review')
    }
  }

  async function saveChosen() {
    const chosen = candidates.filter((c) => kept.has(c.key))
    const before = await db.photos.count()
    const roundId = newId()
    for (const [i, c] of chosen.entries()) {
      const img = await processPhoto(c.file)
      const id = newId()
      await db.transaction('rw', db.photos, db.images, async () => {
        await db.photos.add({
          id,
          takenAt: c.takenAt,
          dateSource: c.dateSource,
          addedAt: Date.now(),
          roundId,
          fingerprint: c.fingerprint,
          width: img.width,
          height: img.height,
          thumb: img.thumb,
        })
        await db.images.add({ id, data: img.data })
      })
      setProgress((i + 1) / chosen.length)
    }
    const completedAt = Date.now()
    await db.rounds.add({ id: roundId, periodStart: status.periodStart, periodEnd: completedAt, completedAt, reviewed: decided.length, kept: chosen.length })
    await ensureAlbums(settings.albumSize, [completedAt, ...chosen.map((c) => c.takenAt)])

    const allRounds = await db.rounds.toArray()
    const album = await findAutoAlbum(settings.albumSize, albumRange(settings.albumSize, completedAt).start)
    setResult({
      kept: chosen.length,
      streak: computeStreak(allRounds.map((r) => r.completedAt), settings.cadenceDays, config.streakGraceDays, completedAt),
      milestone: crossedMilestone(before, before + chosen.length),
      albumId: album?.id,
    })
    setStep('done')
    if (chosen.length) {
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors: ['#c8963e', '#f5ead6', '#6b9e7a', '#ffffff'] })
    }
  }

  const periodText = formatRange(status.periodStart, now)
  const reviewedSome = decided.length > 0

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-5">
      <div className="flex items-center justify-between py-2">
        {step === 'done' || step === 'saving' ? (
          <span />
        ) : reviewedSome ? (
          <ConfirmButton className="btn-ghost -ml-3" confirmText="Avbryt urvalet?" onConfirm={onClose}>
            <X size={20} /> Avbryt
          </ConfirmButton>
        ) : (
          <button className="btn-ghost -ml-3" onClick={onClose}>
            <X size={20} /> Avbryt
          </button>
        )}
        {step === 'swipe' && (
          <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
            <Heart size={15} fill="currentColor" /> {kept.size} / {target}
          </span>
        )}
      </div>

      {step === 'pick' && (
        <div className="flex flex-1 flex-col">
          <p className="label mt-4">{cadenceLabel(settings.cadenceDays)}</p>
          <h1 className="title mt-2">{periodText}</h1>
          <ol className="mt-8 space-y-5">
            <Li n={1}>
              Välj bilderna från <strong>{periodText}</strong> i bildväljaren.
              <span className="mt-1 block text-sm text-muted">Tips: dra fingret över bilderna för att markera många på en gång.</span>
            </Li>
            <Li n={2}>Svep höger för att behålla, vänster för att hoppa över.</Li>
            <Li n={3}>
              Spara dina <strong>{target} bästa</strong> — de hamnar automatiskt i rätt album.
            </Li>
          </ol>
          {notice && <p className="mt-6 rounded-2xl bg-accent-soft p-3 text-sm">{notice}</p>}
          <div className="mt-auto pt-8">
            <label className="btn-primary w-full cursor-pointer py-4 text-lg">
              <ImagePlus size={22} /> Välj bilder
              <input
                data-testid="file-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            <p className="mt-3 text-center text-xs text-muted">🔒 Bilderna stannar i din telefon. Inget laddas upp.</p>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <Centered>
          <Loader2 className="animate-spin text-accent" size={36} />
          <p className="mt-4 text-muted">Läser in bilderna…</p>
        </Centered>
      )}

      {step === 'swipe' && candidates[index] && (
        <div className="flex flex-1 flex-col">
          <ProgressBar value={index / candidates.length} className="mt-1" />
          <p className="mt-2 text-center text-xs text-muted">
            {index + 1} av {candidates.length}
          </p>
          <div className="relative mt-3 flex-1">
            {candidates[index + 1] && (
              <div className="absolute inset-0 scale-95 overflow-hidden rounded-card bg-card opacity-60">
                <img src={candidates[index + 1].url} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <SwipeCard key={candidates[index].key} candidate={candidates[index]} onDecide={decide} />
          </div>
          {goalReached && kept.size >= target && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-accent-soft p-3 text-sm">
              <span>🎉 Målet nått! Fortsätt eller avsluta.</span>
              <button className="btn-primary px-4 py-2 text-sm" onClick={() => setStep('review')}>
                Klar
              </button>
            </div>
          )}
          <SwipeButtons onSkip={() => decide(false)} onKeep={() => decide(true)} onUndo={undo} canUndo={decided.length > 0} />
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-1 flex-col">
          <h1 className="title mt-2">Dina guldkorn</h1>
          <p className="mt-1 text-sm text-muted">
            {kept.size} valda{kept.size > target ? ` — lite fler än målet ${target}, helt okej!` : ''}. Tryck på en bild för att ändra.
          </p>
          {notice && <p className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm">{notice}</p>}
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {candidates.map((c) => {
              const on = kept.has(c.key)
              return (
                <button key={c.key} onClick={() => toggle(c.key)} className="relative aspect-square overflow-hidden rounded-xl">
                  <img src={c.url} alt="" loading="lazy" className={`h-full w-full object-cover transition ${on ? '' : 'opacity-35 grayscale'}`} />
                  {on && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-accent p-1 text-white">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="pb-safe sticky bottom-0 mt-auto bg-gradient-to-t from-paper via-paper to-transparent pt-6">
            <button className="btn-primary w-full py-4 text-lg" onClick={save}>
              {kept.size ? `Spara ${kept.size} guldkorn` : 'Klar — inga bilder den här gången'}
            </button>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <Centered>
          <p className="font-serif text-2xl">Sparar dina guldkorn…</p>
          <ProgressBar value={progress} className="mt-6 w-56" />
        </Centered>
      )}

      {step === 'done' && result && (
        <Centered>
          <div className="text-6xl">{result.kept ? '🌟' : '👍'}</div>
          <h1 className="title mt-4 text-center">{result.kept ? `${result.kept} nya guldkorn!` : 'Urvalet är klart'}</h1>
          {result.kept > 0 && <p className="mt-2 text-muted">{cheer(result.kept + now)}</p>}
          <div className="mt-8 w-full space-y-3">
            {result.streak > 1 && (
              <p className="card p-4 text-center">
                🔥 <strong>{result.streak}</strong> {cadenceUnit(settings.cadenceDays, result.streak)} i rad
              </p>
            )}
            {result.milestone && <p className="card p-4 text-center">{milestoneText(result.milestone)}</p>}
          </div>
          <div className="mt-8 w-full space-y-3">
            {result.albumId && (
              <button className="btn-primary w-full" onClick={() => go({ name: 'album', id: result.albumId! })}>
                Se albumet
              </button>
            )}
            <button className="btn-secondary w-full" onClick={() => go({ name: 'home' })}>
              Till startsidan
            </button>
          </div>
        </Centered>
      )}
    </div>
  )
}

function Li({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-accent">{n}</span>
      <span className="pt-1">{children}</span>
    </li>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center py-10">{children}</div>
}

function SwipeCard({ candidate, onDecide }: { candidate: Candidate; onDecide: (keep: boolean) => void }) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const startX = useRef<number | null>(null)

  const fling = (keep: boolean) => {
    if (leaving) return
    setLeaving(true)
    setDx(keep ? 600 : -600)
    setTimeout(() => onDecide(keep), 160)
  }

  // Keyboard shortcuts for desktop testing: ← skip, → keep.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') fling(true)
      if (e.key === 'ArrowLeft') fling(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const strength = Math.min(1, Math.abs(dx) / 120)
  return (
    <div
      data-testid="swipe-card"
      className="absolute inset-0 touch-none overflow-hidden rounded-card border border-line bg-card shadow-md select-none"
      style={{
        transform: `translateX(${dx}px) rotate(${dx / 25}deg)`,
        transition: startX.current === null || leaving ? 'transform 0.18s ease-out' : 'none',
      }}
      onPointerDown={(e) => {
        startX.current = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => startX.current !== null && setDx(e.clientX - startX.current)}
      onPointerUp={() => {
        startX.current = null
        if (dx > 100) fling(true)
        else if (dx < -100) fling(false)
        else setDx(0)
      }}
      onPointerCancel={() => {
        startX.current = null
        setDx(0)
      }}
    >
      <img src={candidate.url} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
      <div className="absolute inset-x-0 bottom-0 flex gap-2 p-3 text-xs">
        <span className="rounded-full bg-ink/55 px-3 py-1 text-white backdrop-blur">{formatDate(candidate.takenAt)}</span>
        {!candidate.inPeriod && <span className="rounded-full bg-ink/55 px-3 py-1 text-white/80 backdrop-blur">äldre bild</span>}
      </div>
      <span
        className="absolute top-6 left-6 -rotate-12 rounded-xl border-4 border-keep px-3 py-1 text-2xl font-bold text-keep"
        style={{ opacity: dx > 0 ? strength : 0 }}
      >
        BEHÅLL
      </span>
      <span
        className="absolute top-6 right-6 rotate-12 rounded-xl border-4 border-skip px-3 py-1 text-2xl font-bold text-skip"
        style={{ opacity: dx < 0 ? strength : 0 }}
      >
        HOPPA
      </span>
    </div>
  )
}

function SwipeButtons({ onSkip, onKeep, onUndo, canUndo }: { onSkip: () => void; onKeep: () => void; onUndo: () => void; canUndo: boolean }) {
  return (
    <div className="flex items-center justify-center gap-6 py-5">
      <button aria-label="Hoppa över" onClick={onSkip} className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-card text-skip shadow-sm active:scale-90">
        <X size={30} strokeWidth={2.5} />
      </button>
      <button aria-label="Ångra" onClick={onUndo} disabled={!canUndo} className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-muted active:scale-90 disabled:opacity-30">
        <Undo2 size={18} />
      </button>
      <button aria-label="Behåll" onClick={onKeep} className="flex h-16 w-16 items-center justify-center rounded-full bg-keep text-white shadow-sm active:scale-90">
        <Heart size={28} fill="currentColor" />
      </button>
    </div>
  )
}
