import { describe, expect, it } from 'vitest'
import type { Bounds } from '../types'

function isWithinBounds(bounds: Bounds, lat: number, lng: number): boolean {
  return lat >= bounds.south
    && lat <= bounds.north
    && lng >= bounds.west
    && lng <= bounds.east
}

describe('viewport clipping', () => {
  it('treats only points inside the current viewport as playable', () => {
    const bounds: Bounds = {
      north: 25.1,
      south: 25,
      east: 121.5,
      west: 121.4,
    }

    expect(isWithinBounds(bounds, 25.05, 121.45)).toBe(true)
    expect(isWithinBounds(bounds, 24.99, 121.45)).toBe(false)
    expect(isWithinBounds(bounds, 25.05, 121.51)).toBe(false)
  })
})
