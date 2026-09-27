import type { AlbumSize } from '../config'
import { db, newId } from '../db'
import { albumRange } from './dates'

/** Makes sure the automatic month/season/year album covering each time exists. */
export async function ensureAlbums(size: AlbumSize, times: number[]) {
  const ranges = new Map(times.map((t) => albumRange(size, t)).map((r) => [r.start, r]))
  await db.transaction('rw', db.albums, async () => {
    for (const range of ranges.values()) {
      if (!(await findAutoAlbum(size, range.start))) {
        await db.albums.add({ id: newId(), kind: size, createdAt: Date.now(), ...range })
      }
    }
  })
}

/** Read-only lookup (safe inside useLiveQuery). */
export function findAutoAlbum(size: AlbumSize, start: number) {
  return db.albums.where('start').equals(start).filter((a) => a.kind === size).first()
}
