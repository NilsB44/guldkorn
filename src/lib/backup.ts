import { Zip, ZipPassThrough, strToU8, strFromU8, unzipSync } from 'fflate'
import { db, type Album, type Photo, type Round, type Settings, type StoredImage } from '../db'

// Backup = one .zip with all photos + a JSON file with albums, captions, rounds and settings.
// Everything lives only on the phone, so this is the way to move to a new phone.

interface BackupMeta {
  version: 1
  exportedAt: number
  settings?: Settings
  albums: Album[]
  rounds: Round[]
  photos: Omit<Photo, 'thumb'>[]
}

export async function createBackup(onProgress: (done: number, total: number) => void): Promise<Blob> {
  const chunks: Uint8Array[] = []
  const done = new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err)
      chunks.push(chunk)
      if (final) resolve()
    })
    ;(async () => {
      const photos = await db.photos.toArray()
      const meta: BackupMeta = {
        version: 1,
        exportedAt: Date.now(),
        settings: await db.settings.get('app'),
        albums: await db.albums.toArray(),
        rounds: await db.rounds.toArray(),
        photos: photos.map(({ thumb: _thumb, ...p }) => p),
      }
      const add = (name: string, data: Uint8Array) => {
        const file = new ZipPassThrough(name) // JPEGs are already compressed
        zip.add(file)
        file.push(data, true)
      }
      add('guldkorn.json', strToU8(JSON.stringify(meta)))
      for (const [i, photo] of photos.entries()) {
        const image = await db.images.get(photo.id)
        if (image) add(`bilder/${photo.id}.jpg`, new Uint8Array(image.data))
        add(`miniatyrer/${photo.id}.jpg`, new Uint8Array(photo.thumb))
        onProgress(i + 1, photos.length)
      }
      zip.end()
    })().catch(reject)
  })
  await done
  return new Blob(chunks as BlobPart[], { type: 'application/zip' })
}

/** Restores a backup. Photos already on the phone are kept; the backup's photos are merged in. */
export async function restoreBackup(file: Blob): Promise<number> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const metaFile = files['guldkorn.json']
  if (!metaFile) throw new Error('Det här ser inte ut som en Guldkorn-säkerhetskopia.')
  const meta = JSON.parse(strFromU8(metaFile)) as BackupMeta
  const bytes = (u8: Uint8Array) => u8.slice().buffer as ArrayBuffer

  const photos: Photo[] = []
  const images: StoredImage[] = []
  for (const p of meta.photos) {
    const full = files[`bilder/${p.id}.jpg`]
    const thumb = files[`miniatyrer/${p.id}.jpg`] ?? full
    if (!full) continue
    photos.push({ ...p, thumb: bytes(thumb) })
    images.push({ id: p.id, data: bytes(full) })
  }

  await db.transaction('rw', [db.photos, db.images, db.albums, db.rounds, db.settings], async () => {
    await db.photos.bulkPut(photos)
    await db.images.bulkPut(images)
    await db.albums.bulkPut(meta.albums)
    await db.rounds.bulkPut(meta.rounds)
    if (meta.settings) await db.settings.put(meta.settings)
  })
  return photos.length
}
