/** Fallback top clearance per platform when the Host CSS variable is absent. */
const PLATFORM_TOP_CLEARANCE: Readonly<Record<string, number>> = {
  darwin: 48,
  win32: 40,
}

/** Maximum accepted Host clearance; guards against a corrupt CSS value. */
const MAX_TOP_CLEARANCE = 200

/** Height of the toolbar row the overlay adds below the Windows caption. */
const WINDOWS_TOOLBAR_HEIGHT = 40

/** Height of the floating pill row used when the Host reserves no chrome. */
const FLOATING_TOOLBAR_HEIGHT = 30

/**
 * Read the Host's reserved top area (traffic lights / Windows caption).
 *
 * The Host publishes the authoritative value as `--dsh-frame-top-clearance`; the
 * platform fallbacks only apply when that variable is missing. Fullscreen removes the
 * reserved area entirely.
 *
 * @param root - document element.
 * @param computedStyle - style reader (injectable for tests).
 * @returns pixels to reserve at the top of the overlay.
 */
export function readTopInset(
  root: HTMLElement = document.documentElement,
  computedStyle: (element: Element) => CSSStyleDeclaration = (element) => getComputedStyle(element),
): number {
  if (root.hasAttribute('data-fullscreen')) return 0
  const raw = Number.parseFloat(computedStyle(root).getPropertyValue('--dsh-frame-top-clearance'))
  if (Number.isFinite(raw) && raw > 0) return Math.min(MAX_TOP_CLEARANCE, raw)
  const platform = root.dataset.platform ?? ''
  return PLATFORM_TOP_CLEARANCE[platform] ?? 0
}

/**
 * Whether the Host draws its own caption row at the top of the window.
 *
 * The Windows Desktop renders the app menu and the caption controls into that row, so
 * the overlay must stay below it instead of painting over it. macOS keeps the reserved
 * strip empty apart from the traffic lights, and a plain browser has no chrome at all.
 *
 * @param root - document element.
 * @returns true when the Host owns the top row.
 */
export function readWindowsChrome(root: HTMLElement = document.documentElement): boolean {
  return root.hasAttribute('data-windows-titlebar')
}

/** Placement of the overlay's top bar. */
export interface TopbarLayout {
  /** True when the Host reserves no top area and the bar floats over the content. */
  floating: boolean
  /** Host-owned chrome kept uncovered above the overlay, in pixels. */
  caption: number
  /** Bar height, in pixels. */
  height: number
  /** Left padding, leaving room for the macOS traffic lights. */
  leading: number
  /** Right padding, keeping controls clear of the window buttons. */
  trailing: number
  /** Distance from the overlay's top edge to the guest and the centred cards. */
  content: number
}

/**
 * Compute the topbar's platform-specific placement.
 *
 * Three shapes exist: a bar filling the macOS title strip (traffic lights on the left),
 * a bar under the Windows caption (the Desktop menu and window buttons stay usable), and
 * floating pills over the content when the Host reserves no top area.
 *
 * @param inset - reserved top height.
 * @param platform - `document.documentElement.dataset.platform`.
 * @param windowsChrome - whether the Host draws a Windows caption row.
 * @returns layout numbers.
 */
export function computeTopbarLayout(
  inset: number,
  platform: string | undefined,
  windowsChrome: boolean,
): TopbarLayout {
  if (inset <= 0) {
    return {
      floating: true,
      caption: 0,
      height: FLOATING_TOOLBAR_HEIGHT,
      leading: 12,
      trailing: 12,
      content: 0,
    }
  }
  if (windowsChrome || platform === 'win32') {
    return {
      floating: false,
      caption: inset,
      height: WINDOWS_TOOLBAR_HEIGHT,
      leading: 12,
      trailing: 12,
      content: WINDOWS_TOOLBAR_HEIGHT,
    }
  }
  return {
    floating: false,
    caption: 0,
    height: inset,
    leading: platform === 'darwin' ? 84 : 12,
    trailing: 12,
    content: inset,
  }
}

/** @returns the platform marker the Host writes on the document element. */
export function readPlatform(root: HTMLElement = document.documentElement): string {
  return root.dataset.platform ?? ''
}
