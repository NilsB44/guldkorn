import { useState } from 'react'
import { Check, Plus, Sparkles } from 'lucide-react'
import type { Candidate } from '../lib/sources'
import { formatTime } from '../lib/dates'
import { ProgressBar } from './ui'

export interface DuplicateGroup {
  keys: string[]
  suggested: string
}

/**
 * "Same moment, several shots": show each group, pre-select the suggested best photo,
 * and let her switch with one tap. Calls onDone with the keys she did NOT keep.
 */
export default function Duplicates({ groups, byKey, onDone }: { groups: DuplicateGroup[]; byKey: Map<string, Candidate>; onDone: (dropped: Set<string>) => void }) {
  const [index, setIndex] = useState(0)
  const [keep, setKeep] = useState<Map<number, Set<string>>>(() => new Map(groups.map((g, i) => [i, new Set([g.suggested])])))
  const [preview, setPreview] = useState(groups[0].suggested)

  const group = groups[index]
  const kept = keep.get(index)!
  const setKept = (next: Set<string>) => setKeep(new Map(keep).set(index, next))

  function finish(finalKeep = keep) {
    const dropped = new Set<string>()
    groups.forEach((g, i) => g.keys.forEach((k) => !finalKeep.get(i)!.has(k) && dropped.add(k)))
    onDone(dropped)
  }

  function next() {
    if (index + 1 >= groups.length) return finish()
    setIndex(index + 1)
    setPreview(groups[index + 1].suggested)
  }

  const shown = byKey.get(preview)!
  const isKept = kept.has(preview)

  return (
    <div className="flex flex-1 flex-col">
      <ProgressBar value={index / groups.length} className="mt-1" />
      <p className="label mt-4">
        Liknande bilder · {index + 1} av {groups.length}
      </p>
      <h1 className="title mt-1">Välj den bästa</h1>
      <p className="mt-1 text-sm text-muted">
        <Sparkles size={14} className="-mt-0.5 inline text-accent" /> = skarpast och bäst exponerad. Tryck på en annan om du hellre vill ha den.
      </p>

      <div className="relative mt-4 flex-1 overflow-hidden rounded-card border border-line bg-card" style={{ minHeight: '40dvh' }}>
        <img src={shown.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-x-0 top-0 flex justify-between p-3 text-xs">
          <span className="rounded-full bg-ink/55 px-3 py-1 text-white backdrop-blur">{formatTime(shown.takenAt)}</span>
          {preview === group.suggested && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-white">
              <Sparkles size={12} /> Förslag
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
          {isKept ? (
            <button
              className="flex items-center gap-1.5 rounded-full bg-keep px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-90"
              disabled={kept.size === 1}
              onClick={() => {
                const s = new Set(kept)
                s.delete(preview)
                setKept(s)
              }}
            >
              <Check size={16} /> {kept.size === 1 ? 'Vald' : 'Behålls – tryck för att ta bort'}
            </button>
          ) : (
            <button className="flex items-center gap-1.5 rounded-full bg-card/95 px-4 py-2 text-sm font-medium shadow" onClick={() => setKept(new Set(kept).add(preview))}>
              <Plus size={16} /> Behåll även denna
            </button>
          )}
        </div>
      </div>

      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" data-testid="duplicate-strip">
        {group.keys.map((k) => {
          const c = byKey.get(k)!
          const on = kept.has(k)
          return (
            <button
              key={k}
              onClick={() => {
                setPreview(k)
                setKept(new Set([k])) // one tap = "this one instead"
              }}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-offset-2 ring-offset-paper ${preview === k ? 'ring-2 ring-accent' : ''}`}
            >
              <img src={c.url} alt="" className={`h-full w-full object-cover ${on ? '' : 'opacity-50'}`} />
              {on && (
                <span className="absolute top-1 right-1 rounded-full bg-keep p-0.5 text-white">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              {k === group.suggested && (
                <span className="absolute bottom-1 left-1 rounded-full bg-accent p-0.5 text-white">
                  <Sparkles size={10} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 py-4">
        <button className="btn-primary w-full" onClick={next}>
          {index + 1 >= groups.length ? 'Klar' : 'Nästa'} · behåller {kept.size}
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 text-sm" onClick={() => setKept(new Set(group.keys))}>
            Behåll alla {group.keys.length}
          </button>
          {groups.length - index > 1 && (
            <button className="btn-ghost flex-1 text-sm" onClick={() => finish()}>
              Godkänn alla förslag
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
