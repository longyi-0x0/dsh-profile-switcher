/**
 * Read the Desktop browser bridge.
 *
 * Only protocol version 1 is understood; an unknown version is treated as absent so
 * the plugin degrades to a browser tab instead of attaching an unapproved guest.
 *
 * @returns the bridge, or null when embedding is unavailable.
 */
export function readBrowserBridge(): DpsBrowserBridge | null {
  const desktop = window.dshDesktop
  if (desktop === undefined || desktop.protocolVersion !== 1) return null
  return desktop.browser ?? null
}

/**
 * Hand a URL to the system browser.
 *
 * `noopener` is applied after opening instead of as a `window.open` feature,
 * because a `noopener` feature makes `window.open` return null even on success and
 * the old fallback then navigated the whole app away. A blocked popup returns null in
 * a plain browser; Desktop intercepts the window-open request itself.
 *
 * @param url - authenticated URL.
 * @returns whether the handoff appears to have succeeded.
 */
export function openExternalUrl(url: string): boolean {
  let opened: Window | null = null
  try {
    opened = window.open(url, '_blank')
  } catch {
    return false
  }
  if (opened !== null) {
    try {
      opened.opener = null
    } catch {
      // Cross-origin windows may reject the assignment; the URL is ours either way.
    }
    return true
  }
  // Desktop routes window.open through its own handler, which may not return a proxy.
  return window.dshDesktop !== undefined
}
