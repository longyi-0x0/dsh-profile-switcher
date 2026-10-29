import { describe, expect, it } from 'vitest'
import { computeMenuPosition, MENU_MAX_HEIGHT, MENU_WIDTH } from '../../src/client/ui/menu-position'

const viewport = { width: 1024, height: 768 }

describe('computeMenuPosition', () => {
  it('anchors below the trigger and clamps the width', () => {
    const result = computeMenuPosition({ left: 40, top: 20, bottom: 44 }, viewport)
    expect(result).toEqual({ left: 40, top: 50, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT })
  })

  it('clamps horizontally on the right edge', () => {
    const result = computeMenuPosition({ left: 1000, top: 20, bottom: 44 }, viewport)
    expect(result.left).toBe(viewport.width - MENU_WIDTH - 8)
  })

  it('flips above the trigger near the bottom', () => {
    const result = computeMenuPosition({ left: 40, top: 700, bottom: 724 }, viewport)
    expect(result.top).toBeLessThan(700)
    expect(result.top).toBeGreaterThanOrEqual(8)
  })

  it('grows the height when there is room above', () => {
    const result = computeMenuPosition({ left: 40, top: 700, bottom: 724 }, viewport)
    expect(result.maxHeight).toBe(MENU_MAX_HEIGHT)
  })

  it('uses a default position without an anchor', () => {
    expect(computeMenuPosition(null, viewport)).toEqual({
      left: 8,
      top: 88,
      width: MENU_WIDTH,
      maxHeight: MENU_MAX_HEIGHT,
    })
  })

  it('shrinks on a narrow viewport', () => {
    const result = computeMenuPosition(
      { left: 10, top: 20, bottom: 44 },
      { width: 220, height: 400 },
    )
    expect(result.width).toBeGreaterThanOrEqual(160)
    expect(result.width).toBeLessThan(MENU_WIDTH)
    expect(result.maxHeight).toBeGreaterThanOrEqual(160)
  })
})
