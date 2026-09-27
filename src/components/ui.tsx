import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { jpegBlob, type Photo } from '../db'

/** Object URL for a Blob, revoked automatically. */
export function useObjectUrl(blob: Blob | undefined | null): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Thumb({ photo, className = '' }: { photo: Pick<Photo, 'thumb'>; className?: string }) {
  const blob = useMemo(() => jpegBlob(photo.thumb), [photo.thumb])
  const url = useObjectUrl(blob)
  return url ? (
    <img src={url} alt="" draggable={false} className={`object-cover ${className}`} />
  ) : (
    <div className={`bg-line ${className}`} />
  )
}

export function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="pt-safe px-5 pb-4">
      {onBack && (
        <button onClick={onBack} className="-ml-2 mb-2 flex items-center text-sm text-muted">
          <ChevronLeft size={20} /> Tillbaka
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="title truncate">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-accent-soft ${className}`}>
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  )
}

/** Button that needs two taps — the page can't use confirm() dialogs reliably in standalone mode. */
export function ConfirmButton({ children, confirmText = 'Säker? Tryck igen', onConfirm, className = 'btn-secondary' }: {
  children: ReactNode
  confirmText?: string
  onConfirm: () => void
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={`${className} ${armed ? '!border-skip !bg-skip !text-white' : ''}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmText : children}
    </button>
  )
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div className="pb-safe max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-full border border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-2 py-2 text-sm transition ${o.value === value ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

