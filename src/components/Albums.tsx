import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db, newId, photosInRange, type Album } from '../db'
import { albumRange, formatRange, fromDateInput, toDateInput, addDays } from '../lib/dates'
import { ensureAlbums, findAutoAlbum } from '../lib/albums'
import type { AlbumSize } from '../config'
import type { Go } from '../nav'
import { Header, Sheet, Thumb } from './ui'

export default function Albums({ go }: { go: Go }) {
  const albums = useLiveQuery(() => db.albums.orderBy('start').reverse().toArray(), [], [])
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <Header
        title="Album"
        subtitle="Varje album samlar guldkornen från en tidsperiod."
        right={
          <button className="btn-secondary px-4 py-2 text-sm" onClick={() => setCreating(true)}>
            <Plus size={16} /> Nytt
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3 px-5">
        {albums.map((a) => (
          <AlbumCard key={a.id} album={a} onClick={() => go({ name: 'album', id: a.id })} />
        ))}
      </div>
      {albums.length === 0 && <p className="px-5 text-muted">Inga album än. Gör ditt första urval så dyker de upp här.</p>}
      <NewAlbumSheet open={creating} onClose={() => setCreating(false)} onCreated={(id) => go({ name: 'album', id })} />
    </div>
  )
}

function AlbumCard({ album, onClick }: { album: Album; onClick: () => void }) {
  const info = useLiveQuery(async () => {
    const q = photosInRange(album.start, album.end)
    return { count: await q.count(), cover: await photosInRange(album.start, album.end).last() }
  }, [album.start, album.end])
  return (
    <button onClick={onClick} className="text-left">
      <div className="aspect-square overflow-hidden rounded-card border border-line bg-accent-soft">
        {info?.cover ? (
          <Thumb photo={info.cover} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">{album.emoji}</div>
        )}
      </div>
      <p className="mt-2 truncate font-medium">
        {album.emoji} {album.name}
      </p>
      <p className="text-xs text-muted">{info?.count ?? 0} guldkorn</p>
    </button>
  )
}

function NewAlbumSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const now = Date.now()
  const [name, setName] = useState('')
  const [start, setStart] = useState(toDateInput(addDays(now, -30)))
  const [end, setEnd] = useState(toDateInput(now))

  async function create(album: Omit<Album, 'id' | 'createdAt'>) {
    const id = newId()
    await db.albums.add({ ...album, id, createdAt: Date.now() })
    onClose()
    onCreated(id)
  }

  // Presets reuse the automatic album for that period if it already exists.
  async function openPreset(kind: AlbumSize) {
    await ensureAlbums(kind, [now])
    const album = await findAutoAlbum(kind, albumRange(kind, now).start)
    onClose()
    if (album) onCreated(album.id)
  }

  const presets = (['month', 'season', 'year'] as const).map((kind) => ({ kind, ...albumRange(kind, now) }))

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="font-serif text-2xl">Nytt album</h2>
      <p className="label mt-5">Snabbval</p>
      <div className="mt-2 space-y-2">
        {presets.map((p) => (
          <button key={p.kind} className="card flex w-full items-center justify-between p-4 text-left" onClick={() => openPreset(p.kind)}>
            <span>
              {p.emoji} {p.name}
            </span>
            <span className="text-xs text-muted">{formatRange(p.start, p.end, true)}</span>
          </button>
        ))}
      </div>
      <p className="label mt-6">Eget album</p>
      <div className="card mt-2 space-y-3 p-4">
        <input className="w-full rounded-xl border border-line bg-paper px-3 py-2" placeholder="Namn, t.ex. Italienresan" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted">
            Från
            <input type="date" className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex-1 text-xs text-muted">
            Till
            <input type="date" className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <button
          className="btn-primary w-full"
          disabled={!name.trim() || !start || !end || start > end}
          onClick={() => create({ name: name.trim(), emoji: '📷', kind: 'custom', start: fromDateInput(start), end: addDays(fromDateInput(end), 1) })}
        >
          Skapa album
        </button>
      </div>
    </Sheet>
  )
}
