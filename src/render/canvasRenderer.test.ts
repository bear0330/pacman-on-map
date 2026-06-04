import { describe, expect, it } from 'vitest'
import { getGhostBodyColor } from './canvasRenderer'

describe('getGhostBodyColor', () => {
  it('keeps normal ghosts on their base color', () => {
    expect(getGhostBodyColor('chase', '#ff595e', 0, 0)).toBe('#ff595e')
    expect(getGhostBodyColor('eyes', '#ff595e', 0, 0)).toBe('#ff595e')
  })

  it('uses the standard frightened color until the warning window begins', () => {
    expect(getGhostBodyColor('frightened', '#ff595e', 10_000, 7_500)).toBe('#6a4c93')
  })

  it('flashes between warning white and frightened purple near the end', () => {
    expect(getGhostBodyColor('frightened', '#ff595e', 10_000, 8_080)).toBe('#f8f9fa')
    expect(getGhostBodyColor('frightened', '#ff595e', 10_000, 8_240)).toBe('#6a4c93')
  })
})
