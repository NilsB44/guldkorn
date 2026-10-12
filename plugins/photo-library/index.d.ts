export type LibraryAccess = 'granted' | 'limited' | 'denied' | 'prompt'

export interface LibraryPhoto {
  /** PHAsset localIdentifier (iOS) / MediaStore id (Android). */
  id: string
  /** Capture time, ms since epoch. */
  takenAt: number
  width: number
  height: number
  lat?: number
  lon?: number
  /** Photos from the same burst share this id (iOS). */
  burstId?: string
  favorite?: boolean
  screenshot?: boolean
}

export interface PhotoLibraryPlugin {
  checkAccess(): Promise<{ access: LibraryAccess }>
  /** Shows the system prompt "Allow access to all photos?" (only the first time; afterwards use openSettings). */
  requestAccess(): Promise<{ access: LibraryAccess }>
  /** Opens the app's page in system settings (to change photo access later). */
  openSettings(): Promise<void>
  /** iOS "limited" access: lets the user add more photos to the selection. */
  manageLimitedSelection(): Promise<void>
  /** Photos taken in [from, to), oldest first. */
  getPhotos(options: { from: number; to: number; limit?: number }): Promise<{ photos: LibraryPhoto[] }>
  /** One photo as base64 JPEG, scaled so its longest edge is at most maxEdge. Downloads from iCloud if needed. */
  getImage(options: { id: string; maxEdge: number; quality?: number }): Promise<{ data: string; width: number; height: number }>
}

export declare const PhotoLibrary: PhotoLibraryPlugin
