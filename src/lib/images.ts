import exifr from 'exifr'
import { config } from '../config'

export interface PhotoMeta {
  takenAt: number
  dateSource: 'exif' | 'file'
  fingerprint: string
}

/** Reads the capture date from EXIF. iPhone photos keep it when picked in Safari. */
export async function readMeta(file: File): Promise<PhotoMeta> {
  let takenAt: number | undefined
  let dateSource: PhotoMeta['dateSource'] = 'file'
  try {
    const exif = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] })
    const date = exif?.DateTimeOriginal ?? exif?.CreateDate
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      takenAt = date.getTime()
      dateSource = 'exif'
    }
  } catch {
    // No EXIF (screenshots, some edited images) — fall back to file date.
  }
  // Without EXIF the file date is just "when it was picked", so leave it out of the fingerprint.
  const fingerprint = dateSource === 'exif' ? `${file.name}|${file.size}|${takenAt}` : `${file.name}|${file.size}`
  takenAt ??= file.lastModified || Date.now()
  return { takenAt, dateSource, fingerprint }
}

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    // The decoded image stays usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Kunde inte skapa bild'))), 'image/jpeg', quality),
  )
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  // iOS Safari has a tight total canvas memory budget; free it explicitly.
  canvas.width = 0
  canvas.height = 0
}

async function drawScaled(img: HTMLImageElement, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await canvasToBlob(canvas, quality)
  releaseCanvas(canvas)
  return { blob, width, height }
}

/**
 * Re-encodes a picked photo into a full-size JPEG and a thumbnail.
 * Re-encoding also strips all metadata (GPS position etc.) from what we store.
 */
export async function processPhoto(file: Blob) {
  const img = await loadImage(file)
  const full = await drawScaled(img, config.image.maxEdge, config.image.quality)
  const thumb = await drawScaled(img, config.image.thumbEdge, config.image.thumbQuality)
  return {
    data: await full.blob.arrayBuffer(),
    thumb: await thumb.blob.arrayBuffer(),
    width: full.width,
    height: full.height,
  }
}

/** Crops an image to the given aspect ratio (like CSS object-fit: cover) and returns JPEG bytes. */
export async function coverCrop(blob: Blob, aspect: number, maxEdge: number, quality = 0.88): Promise<Uint8Array> {
  const img = await loadImage(blob)
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  let sw = iw
  let sh = iw / aspect
  if (sh > ih) {
    sh = ih
    sw = ih * aspect
  }
  const sx = (iw - sw) / 2
  const sy = (ih - sh) / 2
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const out = await canvasToBlob(canvas, quality)
  releaseCanvas(canvas)
  return new Uint8Array(await out.arrayBuffer())
}
