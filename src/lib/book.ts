// Photo book layout. Pure functions — the HTML preview and the PDF export
// both render from the same BookPage[] so what you see is what you print.

export type PerPage = 'auto' | 1 | 2 | 3 | 4

export interface BookFormat {
  id: string
  label: string
  widthMm: number
  heightMm: number
}

export const BOOK_FORMATS: BookFormat[] = [
  { id: 'square', label: 'Kvadratisk 21×21', widthMm: 210, heightMm: 210 },
  { id: 'landscape', label: 'A4 liggande', widthMm: 297, heightMm: 210 },
  { id: 'portrait', label: 'A4 stående', widthMm: 210, heightMm: 297 },
]

export const PAGE_MARGIN_MM = 12
export const GAP = 0.02 // gap between photos, as a fraction of the content area

/** Position inside the page's content area, all values 0–1. */
export interface Slot {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutPhoto {
  id: string
  width: number
  height: number
  caption?: string
}

export type BookPage =
  | { kind: 'cover'; title: string; subtitle: string; photoId?: string }
  | { kind: 'photos'; items: { photoId: string; slot: Slot; caption?: string }[] }

const half = (1 - GAP) / 2

function slotsFor(photos: LayoutPhoto[]): Slot[] {
  const portrait = (p: LayoutPhoto) => p.height > p.width
  switch (photos.length) {
    case 1:
      return [{ x: 0, y: 0, w: 1, h: 1 }]
    case 2:
      // Two landscapes stack nicely; anything else goes side by side.
      if (!portrait(photos[0]) && !portrait(photos[1])) {
        return [
          { x: 0, y: 0, w: 1, h: half },
          { x: 0, y: half + GAP, w: 1, h: half },
        ]
      }
      return [
        { x: 0, y: 0, w: half, h: 1 },
        { x: half + GAP, y: 0, w: half, h: 1 },
      ]
    case 3: {
      const big = 0.6 - GAP / 2
      return [
        { x: 0, y: 0, w: big, h: 1 },
        { x: big + GAP, y: 0, w: 1 - big - GAP, h: half },
        { x: big + GAP, y: half + GAP, w: 1 - big - GAP, h: half },
      ]
    }
    default:
      return [
        { x: 0, y: 0, w: half, h: half },
        { x: half + GAP, y: 0, w: half, h: half },
        { x: 0, y: half + GAP, w: half, h: half },
        { x: half + GAP, y: half + GAP, w: half, h: half },
      ]
  }
}

// Rhythm for "auto" — varied but calm. Captioned photos always get a page of their own.
const AUTO_PATTERN = [2, 3, 1, 4, 2, 3, 2, 4]

export function layoutBook(photos: LayoutPhoto[], perPage: PerPage, title: string, subtitle: string): BookPage[] {
  const pages: BookPage[] = [{ kind: 'cover', title, subtitle, photoId: photos[0]?.id }]
  let i = 0
  let step = 0
  while (i < photos.length) {
    let n = perPage === 'auto' ? AUTO_PATTERN[step++ % AUTO_PATTERN.length] : perPage
    if (perPage === 'auto') {
      if (photos[i].caption) n = 1
      else {
        // Stop before a captioned photo so it gets its own page.
        const nextCaption = photos.slice(i, i + n).findIndex((p) => p.caption)
        if (nextCaption > 0) n = nextCaption
      }
    }
    const chunk = photos.slice(i, i + n)
    const slots = slotsFor(chunk)
    pages.push({
      kind: 'photos',
      items: chunk.map((p, k) => ({ photoId: p.id, slot: slots[k], caption: p.caption })),
    })
    i += chunk.length
  }
  return pages
}
