import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileDown, Loader2 } from 'lucide-react'
import { db, photosInRange, type Photo } from '../db'
import { BOOK_FORMATS, layoutBook, PAGE_MARGIN_MM, type BookPage, type PerPage } from '../lib/book'
import { formatRange } from '../lib/dates'
import { shareFiles, slugify } from '../lib/share'
import { Header, ProgressBar, Segmented, Thumb } from './ui'

type Export = { state: 'idle' } | { state: 'working'; done: number } | { state: 'ready'; file: File } | { state: 'error'; message: string }

export default function BookView({ id, onBack }: { id: string; onBack: () => void }) {
  const album = useLiveQuery(() => db.albums.get(id), [id])
  const photos = useLiveQuery(() => (album ? photosInRange(album.start, album.end).toArray() : []), [album?.start, album?.end], [])
  const [formatId, setFormatId] = useState('square')
  const [perPage, setPerPage] = useState<PerPage>('auto')
  const [title, setTitle] = useState<string>()
  const [exp, setExp] = useState<Export>({ state: 'idle' })

  const format = BOOK_FORMATS.find((f) => f.id === formatId)!
  const bookTitle = title ?? album?.name ?? ''
  const subtitle = album ? formatRange(album.start, album.end, true) : ''
  const pages = useMemo(() => layoutBook(photos, perPage, bookTitle, subtitle), [photos, perPage, bookTitle, subtitle])
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])

  async function makePdf() {
    setExp({ state: 'working', done: 0 })
    try {
      // jsPDF is loaded only when needed to keep the app fast to open.
      const { renderBookPdf } = await import('../lib/pdf')
      const blob = await renderBookPdf(pages, format, (done) => setExp({ state: 'working', done }))
      setExp({ state: 'ready', file: new File([blob], `${slugify(bookTitle)}-fotobok.pdf`, { type: 'application/pdf' }) })
    } catch (e) {
      setExp({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const reset = () => setExp({ state: 'idle' })

  return (
    <div className="pb-safe">
      <Header title="Fotobok" subtitle={`${pages.length} sidor · ${photos.length} bilder`} onBack={onBack} />

      <div className="space-y-4 px-5">
        <input
          className="w-full rounded-xl border border-line bg-card px-3 py-3 font-serif text-lg"
          value={bookTitle}
          onChange={(e) => (setTitle(e.target.value), reset())}
          aria-label="Titel"
        />
        <Segmented options={BOOK_FORMATS.map((f) => ({ value: f.id, label: f.label }))} value={formatId} onChange={(v) => (setFormatId(v), reset())} />
        <div>
          <p className="label mb-2">Bilder per sida</p>
          <Segmented<PerPage>
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 4, label: '4' },
            ]}
            value={perPage}
            onChange={(v) => (setPerPage(v), reset())}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 px-5">
        {pages.map((page, i) => (
          <PagePreview key={i} page={page} photos={byId} widthMm={format.widthMm} heightMm={format.heightMm} number={i + 1} />
        ))}
      </div>

      <div className="sticky bottom-0 mt-6 space-y-2 bg-gradient-to-t from-paper via-paper to-transparent px-5 pt-6 pb-4">
        {exp.state === 'idle' && (
          <button className="btn-primary w-full py-4" onClick={makePdf} disabled={!photos.length}>
            <FileDown size={20} /> Skapa PDF
          </button>
        )}
        {exp.state === 'working' && (
          <div className="card p-4">
            <p className="flex items-center gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> Skapar sida {exp.done} av {pages.length}…
            </p>
            <ProgressBar value={exp.done / pages.length} className="mt-3" />
          </div>
        )}
        {exp.state === 'ready' && (
          <button className="btn-primary w-full py-4" onClick={() => shareFiles([exp.file], bookTitle)}>
            <FileDown size={20} /> Spara PDF ({(exp.file.size / 1024 / 1024).toFixed(1)} MB)
          </button>
        )}
        {exp.state === 'error' && (
          <button className="btn-secondary w-full" onClick={reset}>
            Något gick fel ({exp.message}). Försök igen
          </button>
        )}
        <p className="text-center text-xs text-muted">Ladda upp PDF:en eller bilderna till t.ex. Önskefoto, CEWE eller Photobox.</p>
      </div>
    </div>
  )
}

function PagePreview({ page, photos, widthMm, heightMm, number }: { page: BookPage; photos: Map<string, Photo>; widthMm: number; heightMm: number; number: number }) {
  const m = (PAGE_MARGIN_MM / widthMm) * 100
  const mv = (PAGE_MARGIN_MM / heightMm) * 100
  return (
    <div>
      <div className="relative overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-line" style={{ aspectRatio: `${widthMm} / ${heightMm}` }}>
        <div className="absolute" style={{ left: `${m}%`, right: `${m}%`, top: `${mv}%`, bottom: `${mv}%` }}>
          {page.kind === 'cover' ? (
            <>
              <div className="absolute inset-x-0 top-0 h-[72%] overflow-hidden bg-line">
                {page.photoId && photos.get(page.photoId) && <Thumb photo={photos.get(page.photoId)!} className="h-full w-full" />}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex h-[28%] flex-col items-center justify-center text-center">
                <p className="font-serif text-sm leading-tight">{page.title}</p>
                <p className="text-[8px] text-muted">{page.subtitle}</p>
              </div>
            </>
          ) : (
            page.items.map(({ photoId, slot, caption }) => {
              const photo = photos.get(photoId)
              return (
                <div key={photoId} className="absolute flex flex-col" style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.w * 100}%`, height: `${slot.h * 100}%` }}>
                  {photo && <Thumb photo={photo} className="min-h-0 w-full flex-1" />}
                  {caption && <p className="truncate pt-0.5 text-center text-[7px] text-muted italic">{caption}</p>}
                </div>
              )
            })
          )}
        </div>
      </div>
      <p className="mt-1 text-center text-[10px] text-muted">{number === 1 ? 'Omslag' : number}</p>
    </div>
  )
}
