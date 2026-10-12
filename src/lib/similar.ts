// Finding near-duplicates ("same moment, several shots") and suggesting the best one.
// Everything runs on the phone on small downscaled copies; nothing is uploaded.
//
//   • dHash: a 64-bit visual fingerprint (compares the brightness of neighbouring pixels on a 9×8 thumbnail).
//     Two photos of the same scene differ in only a few bits.
//   • Sharpness: variance of the Laplacian (edge strength) — blurry/shaky shots score low.
//   • Exposure: penalises very dark/bright photos and blown-out highlights / crushed shadows.

export interface Analysis {
  hash: string // 16 hex chars (64 bits)
  sharpness: number
  exposure: number // 0–1, 1 = well exposed
  /** Average colour (r, g, b). Shots of the same moment have similar colours. */
  color?: [number, number, number]
  /** Almost no detail (dark/blank image): its fingerprint says little, so don't match on it. */
  flat?: boolean
}

export interface SimilarItem {
  key: string
  takenAt: number
  burstId?: string
  analysis?: Analysis
}

/** Grayscale (0–255) from RGBA pixel data. */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return gray
}

/** Difference hash from a 9×8 grayscale image (row-major). */
export function dHash(gray9x8: Float32Array): string {
  let hex = ''
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) {
      byte = (byte << 1) | (gray9x8[y * 9 + x] < gray9x8[y * 9 + x + 1] ? 1 : 0)
    }
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

export function hamming(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < a.length; i += 8) {
    let x = (parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16)) >>> 0
    while (x) {
      x &= x - 1
      d++
    }
  }
  return d
}

export function averageColor(rgba: Uint8ClampedArray): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  const n = rgba.length / 4
  for (let i = 0; i < rgba.length; i += 4) {
    r += rgba[i]
    g += rgba[i + 1]
    b += rgba[i + 2]
  }
  return [r / n, g / n, b / n]
}

/** True when the tiny thumbnail has (almost) no contrast. */
export function isFlat(gray9x8: Float32Array): boolean {
  let sum = 0
  for (const v of gray9x8) sum += v
  const mean = sum / gray9x8.length
  let variance = 0
  for (const v of gray9x8) variance += (v - mean) ** 2
  return Math.sqrt(variance / gray9x8.length) < 4
}

const colorDistance = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Variance of the 4-neighbour Laplacian — higher = sharper. */
export function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += v
      sumSq += v * v
      n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** 1 = nicely exposed; lower for dark, bright or clipped images. */
export function exposureScore(gray: Float32Array): number {
  let sum = 0
  let clipped = 0
  for (const v of gray) {
    sum += v
    if (v < 5 || v > 250) clipped++
  }
  const mean = sum / gray.length / 255
  const clipFraction = clipped / gray.length
  const brightness = 1 - Math.min(1, Math.abs(mean - 0.5) * 1.4)
  return Math.max(0, brightness * (1 - Math.min(1, clipFraction * 2.5)))
}

/** Combined quality used to suggest the best photo within a group. */
export function qualityScore(a: Analysis): number {
  return Math.log1p(a.sharpness) * (0.4 + 0.6 * a.exposure)
}

export interface GroupOptions {
  maxGapMs: number // photos further apart in time than this are never "the same moment"…
  maxDistance: number // …and must be at most this many bits apart
  maxColorDistance: number // …and have similar average colours
  nearIdenticalDistance: number // almost identical photos may be up to `nearIdenticalGapMs` apart
  nearIdenticalGapMs: number
}

export const DEFAULT_GROUPING: GroupOptions = {
  maxGapMs: 3 * 60_000,
  maxDistance: 12,
  maxColorDistance: 40,
  nearIdenticalDistance: 5,
  nearIdenticalGapMs: 30 * 60_000,
}

/**
 * Groups similar photos (union–find over pairs that are close in time and look alike,
 * or that share an iPhone burst id). Returns only groups with 2+ photos, in time order.
 */
export function groupSimilar(items: SimilarItem[], opts: GroupOptions = DEFAULT_GROUPING): string[][] {
  const sorted = [...items].sort((a, b) => a.takenAt - b.takenAt)
  const parent = sorted.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const gap = sorted[j].takenAt - sorted[i].takenAt
      if (gap > Math.max(opts.maxGapMs, opts.nearIdenticalGapMs)) break
      const a = sorted[i]
      const b = sorted[j]
      if (a.burstId && a.burstId === b.burstId) {
        union(i, j)
        continue
      }
      if (!a.analysis || !b.analysis || a.analysis.flat || b.analysis.flat) continue
      if (a.analysis.color && b.analysis.color && colorDistance(a.analysis.color, b.analysis.color) > opts.maxColorDistance) continue
      const d = hamming(a.analysis.hash, b.analysis.hash)
      if ((gap <= opts.maxGapMs && d <= opts.maxDistance) || d <= opts.nearIdenticalDistance) union(i, j)
    }
  }

  const groups = new Map<number, string[]>()
  sorted.forEach((item, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), item.key])
  })
  return [...groups.values()].filter((g) => g.length > 1)
}

/** Key of the best photo in a group (highest quality score; first if not analysed). */
export function suggestBest(group: string[], analyses: Map<string, Analysis | undefined>): string {
  let best = group[0]
  let bestScore = -Infinity
  for (const key of group) {
    const a = analyses.get(key)
    const score = a ? qualityScore(a) : -1
    if (score > bestScore) {
      best = key
      bestScore = score
    }
  }
  return best
}

// ── Browser part ───────────────────────────────────────────────────────────────

async function decodeSmall(blob: Blob, maxEdge: number): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // Fast path: let the browser decode straight to a small size.
    return await createImageBitmap(blob, { resizeWidth: maxEdge, resizeQuality: 'medium' })
  } catch {
    const { loadImage } = await import('./images')
    const img = await loadImage(blob)
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
  }
}

function pixels(source: CanvasImageSource, sw: number, sh: number, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  canvas.width = 0
  canvas.height = 0
  return data
}

/** Analyses one photo (fingerprint + sharpness + exposure) on a ~256 px copy. */
export async function analyzePhoto(blob: Blob): Promise<Analysis> {
  const img = await decodeSmall(blob, 256)
  const w = 256
  const h = Math.max(1, Math.round((img.height / img.width) * 256))
  const rgba = pixels(img, img.width, img.height, w, h)
  const gray = toGray(rgba, w, h)
  const tiny = toGray(pixels(img, img.width, img.height, 9, 8), 9, 8)
  if ('close' in img && typeof img.close === 'function') img.close()
  return { hash: dHash(tiny), sharpness: laplacianVariance(gray, w, h), exposure: exposureScore(gray), color: averageColor(rgba), flat: isFlat(tiny) }
}
