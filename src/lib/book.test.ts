import { describe, expect, it } from 'vitest'
import { layoutBook, type LayoutPhoto } from './book'

const photos = (n: number, extra: Partial<LayoutPhoto> = {}): LayoutPhoto[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, width: 1200, height: 900, ...extra }))

const placed = (pages: ReturnType<typeof layoutBook>) => pages.flatMap((p) => (p.kind === 'photos' ? p.items.map((i) => i.photoId) : []))

describe('layoutBook', () => {
  it('starts with a cover using the first photo', () => {
    const pages = layoutBook(photos(3), 'auto', 'Hösten', 'sep – nov')
    expect(pages[0]).toEqual({ kind: 'cover', title: 'Hösten', subtitle: 'sep – nov', photoId: 'p0' })
  })

  it('places every photo exactly once, in order', () => {
    for (const per of ['auto', 1, 2, 3, 4] as const) {
      const input = photos(23)
      expect(placed(layoutBook(input, per, '', ''))).toEqual(input.map((p) => p.id))
    }
  })

  it('respects a fixed number per page', () => {
    const pages = layoutBook(photos(8), 4, '', '')
    expect(pages).toHaveLength(3)
  })

  it('gives captioned photos their own page in auto mode', () => {
    const input = photos(6)
    input[2].caption = 'Midsommar'
    const page = layoutBook(input, 'auto', '', '').find((p) => p.kind === 'photos' && p.items.some((i) => i.photoId === 'p2'))
    expect(page?.kind === 'photos' && page.items).toHaveLength(1)
  })

  it('keeps slots inside the page', () => {
    for (const p of layoutBook(photos(40), 'auto', '', '')) {
      if (p.kind !== 'photos') continue
      for (const { slot } of p.items) {
        expect(slot.x + slot.w).toBeLessThanOrEqual(1.0001)
        expect(slot.y + slot.h).toBeLessThanOrEqual(1.0001)
      }
    }
  })
})
