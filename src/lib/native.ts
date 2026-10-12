// Native app (Capacitor) helpers. In the browser/PWA these all report "not native".
import { Capacitor } from '@capacitor/core'
import { PhotoLibrary, type LibraryAccess, type LibraryPhoto } from 'guldkorn-photo-library'

export const isNative = () => Capacitor.isNativePlatform()
export const nativePlatform = () => Capacitor.getPlatform() as 'ios' | 'android' | 'web'

export type { LibraryAccess, LibraryPhoto }

export async function libraryAccess(): Promise<LibraryAccess> {
  if (!isNative()) return 'denied'
  return (await PhotoLibrary.checkAccess()).access
}

/** Shows "Allow access to all photos?" the first time; afterwards the user has to use Settings. */
export async function requestLibraryAccess(): Promise<LibraryAccess> {
  return (await PhotoLibrary.requestAccess()).access
}

export const openAppSettings = () => PhotoLibrary.openSettings()
export const manageLimitedSelection = () => PhotoLibrary.manageLimitedSelection()

export async function libraryPhotos(from: number, to: number): Promise<LibraryPhoto[]> {
  return (await PhotoLibrary.getPhotos({ from, to, limit: 2000 })).photos
}

export function base64ToBlob(b64: string, type = 'image/jpeg'): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function libraryImage(id: string, maxEdge: number, quality = 0.85): Promise<Blob> {
  const { data } = await PhotoLibrary.getImage({ id, maxEdge, quality })
  return base64ToBlob(data)
}
