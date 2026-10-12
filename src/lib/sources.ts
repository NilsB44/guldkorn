// Where the photos of a round come from:
//   • web/PWA: files from the system photo picker (<input type="file">)
//   • native app: the whole photo library, filtered to the round's period automatically
// Both produce the same Candidate objects, so the rest of the flow doesn't care.

import { readMeta, type PhotoMeta } from './images'
import { libraryImage, libraryPhotos } from './native'
import type { Analysis } from './similar'

export interface Candidate extends PhotoMeta {
  key: string
  /** Image to show (object URL). */
  url: string
  inPeriod: boolean
  burstId?: string
  favorite?: boolean
  analysis?: Analysis
  /** Image to analyse (small is fine). */
  analysisBlob: () => Promise<Blob>
  /** Full-quality image for saving. */
  fullBlob: () => Promise<Blob>
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

const DAY = 86_400_000

/** Candidates from picked files. `urls` collects object URLs so the caller can revoke them. */
export async function candidatesFromFiles(files: File[], periodStart: number, urls: string[]): Promise<Candidate[]> {
  const metas = await mapLimit(files, 4, readMeta)
  return files.map((file, i) => {
    const url = URL.createObjectURL(file)
    urls.push(url)
    return {
      ...metas[i],
      key: `${i}-${metas[i].fingerprint}`,
      url,
      inPeriod: metas[i].takenAt >= periodStart - DAY,
      analysisBlob: async () => file,
      fullBlob: async () => file,
    }
  })
}

/**
 * Candidates straight from the photo library (native app), for [from, to).
 * Loads a ~900 px preview of each photo for showing and analysing; the full image only when saving.
 */
export async function candidatesFromLibrary(
  from: number,
  to: number,
  urls: string[],
  onProgress: (done: number, total: number) => void,
): Promise<Candidate[]> {
  const photos = (await libraryPhotos(from, to)).filter((p) => !p.screenshot)
  let done = 0
  onProgress(0, photos.length)
  return mapLimit(photos, 3, async (p) => {
    const preview = await libraryImage(p.id, 900, 0.8)
    const url = URL.createObjectURL(preview)
    urls.push(url)
    onProgress(++done, photos.length)
    return {
      key: p.id,
      takenAt: p.takenAt,
      dateSource: 'library' as const,
      fingerprint: `lib:${p.id}`,
      lat: p.lat,
      lon: p.lon,
      burstId: p.burstId,
      favorite: p.favorite,
      url,
      inPeriod: true,
      analysisBlob: async () => preview,
      fullBlob: () => libraryImage(p.id, 3000, 0.9),
    }
  })
}
