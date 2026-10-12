import { describe, expect, it } from 'vitest'
import { dHash, exposureScore, groupSimilar, hamming, isFlat, laplacianVariance, suggestBest, type Analysis } from './similar'

const W = 32
/** Synthetic grayscale image: a soft diagonal gradient with a bright square. */
function scene(shift = 0, blur = false, brightness = 0): Float32Array {
  const g = new Float32Array(W * W)
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let v = 60 + ((x + y) * 140) / (2 * W) + brightness
      if (x >= 10 + shift && x < 20 + shift && y >= 10 && y < 20) v += 90
      g[y * W + x] = Math.min(255, Math.max(0, v))
    }
  }
  if (!blur) return g
  const out = new Float32Array(g)
  for (let y = 1; y < W - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * W + x + dx]
      out[y * W + x] = s / 9
    }
  return out
}

/** Downsample a W×W image to 9×8 for hashing (box filter). */
function to9x8(g: Float32Array): Float32Array {
  const out = new Float32Array(72)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 9; x++) {
      let s = 0
      let n = 0
      for (let yy = Math.floor((y * W) / 8); yy < Math.floor(((y + 1) * W) / 8); yy++)
        for (let xx = Math.floor((x * W) / 9); xx < Math.floor(((x + 1) * W) / 9); xx++) {
          s += g[yy * W + xx]
          n++
        }
      out[y * 9 + x] = s / n
    }
  return out
}

const analysis = (g: Float32Array): Analysis => ({ hash: dHash(to9x8(g)), sharpness: laplacianVariance(g, W, W), exposure: exposureScore(g) })

describe('fingerprint', () => {
  it('is 64 bits as 16 hex chars', () => {
    expect(dHash(to9x8(scene()))).toMatch(/^[0-9a-f]{16}$/)
  })
  it('similar scenes are close, different scenes are far', () => {
    const a = dHash(to9x8(scene()))
    const b = dHash(to9x8(scene(1)))
    const flipped = dHash(to9x8(scene().reverse()))
    expect(hamming(a, a)).toBe(0)
    expect(hamming(a, b)).toBeLessThanOrEqual(12)
    expect(hamming(a, flipped)).toBeGreaterThan(20)
  })
  it('hamming counts differing bits', () => {
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hamming('0000000000000001', '0000000000000000')).toBe(1)
  })
})

describe('quality', () => {
  it('blur lowers sharpness', () => {
    expect(laplacianVariance(scene(0, true), W, W)).toBeLessThan(laplacianVariance(scene(), W, W))
  })
  it('over-exposure lowers the exposure score', () => {
    expect(exposureScore(scene(0, false, 200))).toBeLessThan(exposureScore(scene()))
  })
  it('suggests the sharp, well-exposed photo', () => {
    const analyses = new Map([
      ['blurry', analysis(scene(0, true))],
      ['sharp', analysis(scene())],
      ['bright', analysis(scene(0, false, 200))],
    ])
    expect(suggestBest(['blurry', 'sharp', 'bright'], analyses)).toBe('sharp')
  })
})

describe('groupSimilar', () => {
  const t0 = Date.UTC(2026, 9, 10, 12)
  const same = analysis(scene())
  const near = analysis(scene(1))
  const other = analysis(scene().reverse())

  it('groups look-alikes taken close together', () => {
    const groups = groupSimilar([
      { key: 'a', takenAt: t0, analysis: same },
      { key: 'b', takenAt: t0 + 20_000, analysis: near },
      { key: 'c', takenAt: t0 + 40_000, analysis: other },
      { key: 'd', takenAt: t0 + 3_600_000, analysis: same },
    ])
    expect(groups).toEqual([['a', 'b']])
  })

  it('near-identical photos group even 20 minutes apart', () => {
    expect(groupSimilar([{ key: 'a', takenAt: t0, analysis: same }, { key: 'b', takenAt: t0 + 20 * 60_000, analysis: same }])).toEqual([['a', 'b']])
  })

  it('burst shots always group', () => {
    expect(groupSimilar([{ key: 'a', takenAt: t0, burstId: 'B1' }, { key: 'b', takenAt: t0 + 500, burstId: 'B1' }])).toEqual([['a', 'b']])
  })

  it('flat (blank/dark) images are not matched on their fingerprint', () => {
    const flat = { ...same, flat: true }
    expect(groupSimilar([{ key: 'a', takenAt: t0, analysis: flat }, { key: 'b', takenAt: t0 + 1000, analysis: flat }])).toEqual([])
  })

  it('different colours are not the same moment', () => {
    const red = { ...same, color: [200, 40, 40] as [number, number, number] }
    const blue = { ...same, color: [40, 40, 200] as [number, number, number] }
    expect(groupSimilar([{ key: 'a', takenAt: t0, analysis: red }, { key: 'b', takenAt: t0 + 1000, analysis: blue }])).toEqual([])
  })

  it('isFlat detects no-contrast thumbnails', () => {
    expect(isFlat(new Float32Array(72).fill(20))).toBe(true)
    expect(isFlat(to9x8(scene()))).toBe(false)
  })

  it('chains of similar photos form one group', () => {
    const groups = groupSimilar([
      { key: 'a', takenAt: t0, analysis: same },
      { key: 'b', takenAt: t0 + 60_000, analysis: same },
      { key: 'c', takenAt: t0 + 120_000, analysis: same },
    ])
    expect(groups).toEqual([['a', 'b', 'c']])
  })
})
