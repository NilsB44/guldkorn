import { describe, expect, it } from 'vitest'
import { distanceKm, parsePlaces, placeLabel } from './places'
import { timeOfDay } from './dates'
import { cameraName } from './images'

const index = parsePlaces(['Visby\tSE\t57.641\t18.296', 'Stockholm\tSE\t59.329\t18.069', 'Barcelona\tES\t41.389\t2.159', ''].join('\n'))

describe('places', () => {
  it('distance', () => {
    expect(distanceKm(59.329, 18.069, 57.641, 18.296)).toBeGreaterThan(180)
    expect(distanceKm(59.329, 18.069, 59.329, 18.069)).toBe(0)
  })

  it('names the nearest place', () => {
    expect(placeLabel(index.nearest(57.64, 18.3))).toBe('Visby')
    expect(placeLabel(index.nearest(57.8, 18.5))).toBe('nära Visby')
  })

  it('adds the country abroad', () => {
    expect(placeLabel(index.nearest(41.39, 2.16))).toMatch(/^Barcelona, /)
  })

  it('gives nothing far from any place', () => {
    expect(placeLabel(index.nearest(0, -30))).toBeUndefined()
  })
})

describe('metadata helpers', () => {
  it('time of day', () => {
    expect(timeOfDay(new Date(2026, 9, 10, 7).getTime()).label).toBe('morgon')
    expect(timeOfDay(new Date(2026, 9, 10, 14).getTime()).label).toBe('eftermiddag')
    expect(timeOfDay(new Date(2026, 9, 10, 23).getTime()).label).toBe('natt')
  })

  it('camera name', () => {
    expect(cameraName('Apple', 'iPhone 15 Pro')).toBe('iPhone 15 Pro')
    expect(cameraName('samsung', 'SM-S918B')).toBe('Samsung SM-S918B')
    expect(cameraName('Google', 'Google Pixel 8')).toBe('Google Pixel 8')
    expect(cameraName(undefined, undefined)).toBeUndefined()
  })
})
