/**
 * Hands files to the phone's share sheet (on iPhone: "Spara i Bilder", "Spara i Filer",
 * AirDrop, a photo book app …). Falls back to a normal download on desktop / http.
 *
 * Must be called directly from a tap: iOS refuses to open the share sheet if a long
 * async task ran first. That's why the UI prepares files first, then shows a "Spara" button.
 */
export async function shareFiles(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Fall through to download (e.g. NotAllowedError).
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return 'downloaded'
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'guldkorn'
  )
}
