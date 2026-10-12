// Offline reverse geocoding: GPS position → "Visby" / "nära Visby" / "Barcelona, Spanien".
// Uses the bundled public/places.tsv (GeoNames, CC BY 4.0), so no position ever leaves the phone.

export interface Place {
  name: string
  cc: string
  lat: number
  lon: number
}

export interface PlaceHit {
  place: Place
  km: number
}

const cellKey = (lat: number, lon: number) => `${Math.floor(lat)},${Math.floor(lon)}`

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

export class PlaceIndex {
  private cells = new Map<string, Place[]>()

  constructor(places: Place[]) {
    for (const p of places) {
      const key = cellKey(p.lat, p.lon)
      const cell = this.cells.get(key)
      if (cell) cell.push(p)
      else this.cells.set(key, [p])
    }
  }

  /** Nearest known place within the surrounding 1°×1° cells (≈ 60–110 km), if any. */
  nearest(lat: number, lon: number): PlaceHit | undefined {
    let best: PlaceHit | undefined
    const la = Math.floor(lat)
    const lo = Math.floor(lon)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const place of this.cells.get(`${la + dy},${lo + dx}`) ?? []) {
          const km = distanceKm(lat, lon, place.lat, place.lon)
          if (!best || km < best.km) best = { place, km }
        }
      }
    }
    return best
  }
}

export function parsePlaces(tsv: string): PlaceIndex {
  const places: Place[] = []
  for (const line of tsv.split('\n')) {
    const [name, cc, lat, lon] = line.split('\t')
    if (name && lon) places.push({ name, cc, lat: Number(lat), lon: Number(lon) })
  }
  return new PlaceIndex(places)
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['sv'], { type: 'region' })
  } catch {
    return undefined
  }
})()

/** Human label, or undefined when the nearest place is too far away to be meaningful (e.g. at sea). */
export function placeLabel(hit: PlaceHit | undefined, homeCountry = 'SE'): string | undefined {
  if (!hit || hit.km > 40) return undefined
  const name = hit.km <= 8 ? hit.place.name : `nära ${hit.place.name}`
  if (hit.place.cc === homeCountry) return name
  return `${name}, ${regionNames?.of(hit.place.cc) ?? hit.place.cc}`
}

let index: Promise<PlaceIndex> | undefined

function loadIndex(): Promise<PlaceIndex> {
  index ??= fetch(`${import.meta.env.BASE_URL}places.tsv`)
    .then((r) => {
      if (!r.ok) throw new Error(`places.tsv: ${r.status}`)
      return r.text()
    })
    .then(parsePlaces)
    .catch((err) => {
      index = undefined // retry next time
      throw err
    })
  return index
}

/** Place name for a GPS position. Never throws — a missing name is not worth failing a save for. */
export async function lookupPlace(lat: number | undefined, lon: number | undefined): Promise<string | undefined> {
  if (lat === undefined || lon === undefined || (lat === 0 && lon === 0)) return undefined
  try {
    return placeLabel((await loadIndex()).nearest(lat, lon))
  } catch (err) {
    console.warn('Place lookup failed', err)
    return undefined
  }
}
