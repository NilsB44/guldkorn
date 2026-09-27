import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Download, Loader2, Pencil, Trash2 } from 'lucide-react'
import { db, deletePhoto, jpegBlob, photosInRange, type Photo } from '../db'
import { formatDate, formatRange, isoWeek } from '../lib/dates'
import { shareFiles, slugify } from '../lib/share'
import type { Go } from '../nav'
import { ConfirmButton, Header, Sheet, Thumb, useObjectUrl } from './ui'

export default function AlbumDetail({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const album = useLiveQuery(() => db.albums.get(id), [id])
  const photos = useLiveQuery(() => (album ? photosInRange(album.start, album.end).toArray() : []), [album?.start, album?.end], [])
  const [open, setOpen] = useState<Photo>()
  const [renaming, setRenaming] = useState(false)
  const [files, setFiles] = useState<File[] | 'preparing'>()

  if (!album) return <Header title="" onBack={onBack} />

  // Group by week for a calm, diary-like overview.
  const groups: { label: string; photos: Photo[] }[] = []
  for (const p of photos) {
    const label = `Vecka ${isoWeek(p.takenAt)}`
    const last = groups.at(-1)
    if (last?.label === label) last.photos.push(p)
    else groups.push({ label, photos: [p] })
  }

  async function prepareFiles() {
    setFiles('preparing')
    const slug = slugify(album!.name)
    const images = await db.images.bulkGet(photos.map((p) => p.id))
    setFiles(
      images.flatMap((img, i) => (img ? [new File([img.data],`${slug}-${String(i + 1).padStart(3, '0')}.jpg`, { type: 'image/jpeg' })] : [])),
    )
  }

  return (
    <div>
      <Header
        title={`${album.emoji} ${album.name}`}
        subtitle={`${formatRange(album.start, album.end, true)} · ${photos.length} guldkorn`}
        onBack={onBack}
        right={
          <button className="btn-ghost" aria-label="Byt namn" onClick={() => setRenaming(true)}>
            <Pencil size={18} />
          </button>
        }
      />

      <div className="flex gap-2 px-5">
        <button className="btn-primary flex-1" disabled={!photos.length} onClick={() => go({ name: 'book', id })}>
          <BookOpen size={18} /> Fotobok
        </button>
        {files && files !== 'preparing' ? (
          <button className="btn-secondary flex-1" onClick={async () => (await shareFiles(files, album.name)) !== 'cancelled' && setFiles(undefined)}>
            <Download size={18} /> Spara {files.length} bilder
          </button>
        ) : (
          <button className="btn-secondary flex-1" disabled={!photos.length || files === 'preparing'} onClick={prepareFiles}>
            {files === 'preparing' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Exportera
          </button>
        )}
      </div>

      {photos.length === 0 && <p className="mt-10 px-5 text-center text-muted">Inga guldkorn från den här perioden än.</p>}

      <div className="mt-6 space-y-6 px-5">
        {groups.map((g) => (
          <section key={g.label}>
            <p className="label mb-2">{g.label}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {g.photos.map((p) => (
                <button key={p.id} onClick={() => setOpen(p)} className="relative aspect-square overflow-hidden rounded-xl">
                  <Thumb photo={p} className="h-full w-full" />
                  {p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 px-2 pt-4 pb-1 text-[10px] text-white">{p.caption}</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {album.kind === 'custom' && (
        <div className="mt-10 px-5 text-center">
          <ConfirmButton className="btn-ghost text-sm" confirmText="Ta bort albumet? (bilderna finns kvar)" onConfirm={async () => (await db.albums.delete(id), onBack())}>
            <Trash2 size={16} /> Ta bort album
          </ConfirmButton>
        </div>
      )}

      <PhotoSheet photo={open} onClose={() => setOpen(undefined)} />
      <RenameSheet open={renaming} name={album.name} emoji={album.emoji} onClose={() => setRenaming(false)} onSave={(name, emoji) => db.albums.update(id, { name, emoji })} />
    </div>
  )
}

function PhotoSheet({ photo, onClose }: { photo?: Photo; onClose: () => void }) {
  const image = useLiveQuery(() => (photo ? db.images.get(photo.id) : undefined), [photo?.id])
  const blob = useMemo(() => (image ? jpegBlob(image.data) : undefined), [image])
  const url = useObjectUrl(blob)
  const [caption, setCaption] = useState('')
  const [editingId, setEditingId] = useState<string>()
  if (photo && editingId !== photo.id) {
    setEditingId(photo.id)
    setCaption(photo.caption ?? '')
  }

  async function close() {
    if (photo && caption !== (photo.caption ?? '')) await db.photos.update(photo.id, { caption: caption.trim() || undefined })
    onClose()
  }

  return (
    <Sheet open={!!photo} onClose={close}>
      {photo && (
        <>
          {url ? <img src={url} alt="" className="max-h-[55dvh] w-full rounded-2xl object-contain" /> : <Thumb photo={photo} className="max-h-[55dvh] w-full rounded-2xl" />}
          <p className="mt-3 text-sm text-muted">
            {formatDate(photo.takenAt)}
            {photo.dateSource === 'file' && ' (ungefärligt datum)'}
          </p>
          <textarea
            className="mt-3 w-full rounded-2xl border border-line bg-card p-3"
            rows={2}
            maxLength={120}
            placeholder="Skriv en bildtext till fotoboken…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1" onClick={close}>
              Klar
            </button>
            <ConfirmButton confirmText="Ta bort för gott?" onConfirm={async () => (await deletePhoto(photo.id), onClose())}>
              <Trash2 size={18} />
            </ConfirmButton>
          </div>
        </>
      )}
    </Sheet>
  )
}

const EMOJIS = ['📷', '❄️', '🌷', '☀️', '🍁', '✨', '❤️', '🏖️', '🎄', '🎉', '🌍', '🐶']

function RenameSheet({ open, name, emoji, onClose, onSave }: { open: boolean; name: string; emoji: string; onClose: () => void; onSave: (name: string, emoji: string) => void }) {
  const [value, setValue] = useState(name)
  const [icon, setIcon] = useState(emoji)
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="font-serif text-2xl">Byt namn</h2>
      <input className="mt-4 w-full rounded-xl border border-line bg-card px-3 py-3" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => setIcon(e)} className={`h-11 w-11 rounded-xl text-xl ${icon === e ? 'bg-accent-soft ring-2 ring-accent' : 'bg-card'}`}>
            {e}
          </button>
        ))}
      </div>
      <button
        className="btn-primary mt-5 w-full"
        disabled={!value.trim()}
        onClick={() => {
          onSave(value.trim(), icon)
          onClose()
        }}
      >
        Spara
      </button>
    </Sheet>
  )
}
