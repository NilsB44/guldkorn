// Developer helper: fills the app with generated test photos so you can try
// albums, streaks and the photo book without picking real photos.
// Visible in Inställningar when running `npm run dev`, or with ?dev in the URL.

import { db, newId, getSettings } from '../db'
import { ensureAlbums } from './albums'
import { addDays, DAY } from './dates'
import { canvasToBlob, processPhoto } from './images'

const PALETTE = ['#e9c46a', '#f4a261', '#e76f51', '#2a9d8f', '#8ab17d', '#a3c4f3', '#cdb4db', '#ffafcc']

/** A colourful JPEG with a big label — also used by the end-to-end test. */
export async function makeTestImage(label: string, portrait: boolean, seed: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = portrait ? 900 : 1200
  canvas.height = portrait ? 1200 : 900
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  g.addColorStop(0, PALETTE[seed % PALETTE.length])
  g.addColorStop(1, PALETTE[(seed + 3) % PALETTE.length])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = 'bold 110px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  return canvasToBlob(canvas, 0.85)
}

/** Adds `weeks` weekly rounds of fake photos ending today. */
export async function seedDemoData(weeks = 6, perWeek = 6) {
  const settings = await getSettings()
  const now = Date.now()
  let seed = 0
  const times: number[] = []
  for (let w = weeks; w >= 1; w--) {
    const periodEnd = addDays(now, -(w - 1) * 7)
    const periodStart = addDays(periodEnd, -7)
    const roundId = newId()
    for (let i = 0; i < perWeek; i++) {
      const takenAt = periodStart + Math.random() * 7 * DAY
      const blob = await makeTestImage(`#${++seed}`, seed % 3 === 0, seed)
      const processed = await processPhoto(blob)
      const id = newId()
      await db.photos.add({
        id,
        takenAt,
        dateSource: 'exif',
        addedAt: periodEnd,
        roundId,
        fingerprint: `demo-${id}`,
        width: processed.width,
        height: processed.height,
        thumb: processed.thumb,
        caption: seed % 7 === 0 ? 'En fin dag' : undefined,
      })
      await db.images.add({ id, data: processed.data })
      times.push(takenAt)
    }
    await db.rounds.add({ id: roundId, periodStart, periodEnd, completedAt: periodEnd, reviewed: perWeek * 2, kept: perWeek })
  }
  await ensureAlbums(settings.albumSize, times)
}
