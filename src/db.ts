import Dexie, { type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { config, type AlbumSize, type PickMode } from './config'

// Everything is stored locally in the browser's IndexedDB. Nothing is ever uploaded.

export interface Photo {
  id: string
  takenAt: number // capture time (EXIF), falls back to file date
  dateSource: 'exif' | 'file'
  addedAt: number
  roundId: string
  fingerprint: string // used to skip photos that were already saved
  width: number
  height: number
  thumb: ArrayBuffer // JPEG bytes
  caption?: string
}

/** Full-size image, kept in its own table so lists only load thumbnails. */
export interface StoredImage {
  id: string // same as Photo.id
  data: ArrayBuffer // JPEG bytes
}

// Images are stored as raw bytes rather than Blobs: some Safari/WebKit versions
// (and private browsing) fail to store Blobs in IndexedDB, ArrayBuffers always work.
export const jpegBlob = (data: ArrayBuffer | Uint8Array) => new Blob([data as BlobPart], { type: 'image/jpeg' })

/** An album is a date range — every photo taken inside the range belongs to it. */
export interface Album {
  id: string
  name: string
  emoji: string
  kind: AlbumSize | 'custom'
  start: number // inclusive
  end: number // exclusive
  createdAt: number
}

export interface Round {
  id: string
  periodStart: number
  periodEnd: number
  completedAt: number
  reviewed: number
  kept: number
}

export interface Settings {
  id: 'app'
  name: string
  cadenceDays: number
  picksPerRound: number
  albumSize: AlbumSize
  reminderWeekday: number
  reminderTime: string
  pickMode: PickMode
}

class GuldkornDB extends Dexie {
  photos!: EntityTable<Photo, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  albums!: EntityTable<Album, 'id'>
  rounds!: EntityTable<Round, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('guldkorn')
    this.version(1).stores({
      photos: 'id, takenAt, roundId, fingerprint',
      images: 'id',
      albums: 'id, start, kind',
      rounds: 'id, completedAt',
      settings: 'id',
    })
  }
}

export const db = new GuldkornDB()

export const defaultSettings: Settings = {
  id: 'app',
  name: config.recipientName,
  ...config.defaults,
}

export async function getSettings(): Promise<Settings> {
  return { ...defaultSettings, ...(await db.settings.get('app')) }
}

export function saveSettings(patch: Partial<Settings>) {
  // Transaction so quick successive saves can't overwrite each other.
  return db.transaction('rw', db.settings, async () => {
    await db.settings.put({ ...(await getSettings()), ...patch, id: 'app' })
  })
}

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], defaultSettings)
}

/** Random id that also works on plain http (crypto.randomUUID needs https). */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function photosInRange(start: number, end: number) {
  return db.photos.where('takenAt').between(start, end, true, false)
}

/** Deletes a photo everywhere (it disappears from every album covering its date). */
export async function deletePhoto(id: string) {
  await db.transaction('rw', db.photos, db.images, async () => {
    await db.photos.delete(id)
    await db.images.delete(id)
  })
}

export async function clearAllData() {
  await db.transaction('rw', [db.photos, db.images, db.albums, db.rounds, db.settings], async () => {
    await Promise.all([db.photos.clear(), db.images.clear(), db.albums.clear(), db.rounds.clear(), db.settings.clear()])
  })
}
