/** Fallback top clearance per platform when the Host CSS variable is absent. */
const PLATFORM_TOP_CLEARANCE: Readonly<Record<string, number>> = {
  darwin: 48,
  win32: 40,
}

/** Maximum accepted Host clearance; guards against a corrupt CSS value. */
const MAX_TOP_CLEARANCE = 200

/**
 * Read the Host's reserved top area (traffic lights / Windows titlebar overlay).
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

/** Horizontal room reserved for the window controls on a non-floating bar. */
export interface TopbarLayout {
  floating: boolean
  leading: number
  trailing: number
}

/**
 * Compute the topbar's platform-specific insets.
 *
 * macOS traffic lights need room on the left; the Windows titlebar overlay needs room
 * on the right. A floating bar (fullscreen or no reserved area) only needs padding.
 *
 * @param inset - reserved top height.
 * @param platform - `document.documentElement.dataset.platform`.
 * @returns layout numbers.
 */
export function computeTopbarLayout(inset: number, platform: string | undefined): TopbarLayout {
  const floating = inset <= 0
  return {
    floating,
    leading: !floating && platform === 'darwin' ? 84 : 12,
    trailing: !floating && platform === 'win32' ? 148 : 12,
  }
}

/** @returns the platform marker the Host writes on the document element. */
export function readPlatform(root: HTMLElement = document.documentElement): string {
  return root.dataset.platform ?? ''
}
