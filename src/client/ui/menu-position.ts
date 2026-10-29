import type { MenuAnchor } from '../state'

/** Preferred menu width. */
export const MENU_WIDTH = 248
/** Maximum menu height. */
export const MENU_MAX_HEIGHT = 480
/** Minimum height before the menu gives up and scrolls instead. */
const MENU_MIN_HEIGHT = 160
/** Minimum width on very narrow windows. */
const MENU_MIN_WIDTH = 160
/** Gap between the trigger and the menu. */
const ANCHOR_GAP = 6
/** Minimum distance from the viewport edges. */
const VIEWPORT_MARGIN = 8
/** Below this space the menu prefers to flip above the trigger. */
const FLIP_THRESHOLD = 220

/** Viewport size. */
export interface Viewport {
  width: number
  height: number
}

/** Resolved fixed-position geometry. */
export interface MenuGeometry {
  left: number
  top: number
  width: number
  maxHeight: number
}

/**
 * Position the anchored menu inside the viewport.
 *
 * The menu flips above the trigger when the space below is both small and smaller
 * than the space above, and clamps horizontally so a narrow window never clips it.
 *
 * @param anchor - trigger rectangle, or null before the trigger is measurable.
 * @param viewport - current window size.
 * @returns fixed-position geometry.
 */
export function computeMenuPosition(anchor: MenuAnchor | null, viewport: Viewport): MenuGeometry {
  const width = Math.min(MENU_WIDTH, Math.max(MENU_MIN_WIDTH, viewport.width - 2 * VIEWPORT_MARGIN))
  const left =
    anchor === null
      ? VIEWPORT_MARGIN
      : Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, viewport.width - width - VIEWPORT_MARGIN))
  const below = anchor === null ? viewport.height - 96 : viewport.height - anchor.bottom - 12
  const above = anchor === null ? 0 : anchor.top - 12
  const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, Math.max(below, above)))
  const flip = anchor !== null && below < FLIP_THRESHOLD && above > below
  const top =
    anchor === null
      ? 88
      : flip
        ? Math.max(VIEWPORT_MARGIN, anchor.top - maxHeight - ANCHOR_GAP)
        : anchor.bottom + ANCHOR_GAP
  return { left, top, width, maxHeight }
}
