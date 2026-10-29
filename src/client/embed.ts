import type { ClientErrorCode } from './i18n'

/** Time allowed for the guest document to reach `dom-ready`. */
export const DOM_READY_TIMEOUT_MS = 10_000
/** Time allowed for the target URL to finish loading. */
export const LOAD_TIMEOUT_MS = 15_000
/** Delay before retrying an aborted `loadURL` through the `src` attribute. */
export const ABORTED_RETRY_MS = 600
/** Upper bound for releasing a guest during unmount. */
const RELEASE_GRACE_MS = 2_000

/** Reservation issued by the Desktop main process. */
export interface GuestReservation {
  lease: string
  partition: string
}

/** The subset of the preload browser bridge this plugin uses. */
export interface GuestBridge {
  acquire(workspace: string): Promise<GuestReservation>
  release(lease: string): Promise<void> | void
  onOpenRequested?(lease: string, listener: (url: string) => void): () => void
}

/** `<webview>` methods this module calls. */
export interface GuestElement extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
}

/** A failure surfaced by the guest lifecycle. */
export interface GuestFailure {
  code: ClientErrorCode
  detail?: string
}

/** A mounted guest and its disposal handle. */
export interface MountedGuest {
  /** Remove the element and release the lease exactly once. */
  dispose(): Promise<void>
}

/** Options for {@link mountGuest}. */
export interface MountGuestOptions {
  bridge: GuestBridge
  host: HTMLElement
  url: string
  workspace: string
  /** Component lifetime signal; aborting tears the guest down. */
  signal: AbortSignal
  /** System-browser handoff for `target=_blank` requests from the guest. */
  openExternal: (url: string) => void
  onReady: () => void
  onFailure: (failure: GuestFailure) => void
  /** Element factory (injectable for tests). */
  createElement?: () => GuestElement
}

/** @param error - unknown thrown value. @returns its message. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Electron may reject `loadURL` with a wrapper whose `code` is
 * `GUEST_VIEW_MANAGER_CALL` while the real network error only survives in the
 * message. A token URL answers 303 into the cookie redirect, which aborts the
 * original navigation with `ERR_ABORTED`; the shipped browser panel ignores exactly
 * that error and the redirect keeps loading.
 *
 * @param error - rejection from `loadURL`.
 * @returns whether the navigation was aborted by the redirect.
 */
export function isAbortedLoad(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code
    if (code === 'ERR_ABORTED' || code === -3) return true
  }
  const text = messageOf(error)
  return text.includes('ERR_ABORTED') || text.includes('(-3)')
}

/** @param value - candidate URL. */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//u.test(value)
}

/**
 * Mount one leased `<webview>` and drive its load lifecycle.
 *
 * The element attributes mirror `@deepseek-ai/dsh-client-ui-sidebar-browser`: the
 * Desktop main process only admits a guest whose `src` is `about:blank#<lease>`, whose
 * partition matches the reservation, and whose name is the lease. The URL itself is
 * never written to an attribute; it reaches the guest through `loadURL` only.
 *
 * @param options - bridge, host element, target URL, and callbacks.
 * @returns the disposal handle, or a no-op handle when mounting was cancelled.
 */
export async function mountGuest(options: MountGuestOptions): Promise<MountedGuest> {
  const { bridge, host, url, workspace, signal, openExternal, onReady, onFailure } = options
  const lifetime = new AbortController()

  let element: GuestElement | null = null
  let lease: string | null = null
  let disposed = false
  let failed = false
  let started = false
  let domReadyTimer: ReturnType<typeof setTimeout> | null = null
  let loadTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeOpen: (() => void) | null = null
  let onOuterAbort: (() => void) | null = null

  const clearTimers = (): void => {
    if (domReadyTimer !== null) clearTimeout(domReadyTimer)
    if (loadTimer !== null) clearTimeout(loadTimer)
    if (retryTimer !== null) clearTimeout(retryTimer)
    domReadyTimer = null
    loadTimer = null
    retryTimer = null
  }

  const release = async (value: string): Promise<void> => {
    try {
      await bridge.release(value)
    } catch {
      // The main process already released it.
    }
  }

  const cleanup = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    clearTimers()
    lifetime.abort()
    if (onOuterAbort !== null) signal.removeEventListener('abort', onOuterAbort)
    if (unsubscribeOpen !== null) {
      unsubscribeOpen()
      unsubscribeOpen = null
    }
    if (element !== null) {
      try {
        element.remove()
      } catch {
        // Already detached.
      }
      element = null
    }
    if (lease !== null) {
      const value = lease
      lease = null
      await release(value)
    }
  }

  onOuterAbort = (): void => {
    lifetime.abort()
    void cleanup()
  }
  if (signal.aborted) onOuterAbort()
  else signal.addEventListener('abort', onOuterAbort, { once: true })

  const fail = (code: ClientErrorCode, detail?: string): void => {
    if (failed || disposed) return
    failed = true
    void cleanup().then(() => {
      onFailure({ code, ...(detail === undefined ? {} : { detail }) })
    })
  }

  /** @param target - event target. @param type - event name. @param listener - callback. */
  const listen = (target: EventTarget, type: string, listener: EventListener): void => {
    target.addEventListener(type, listener)
    lifetime.signal.addEventListener('abort', () => target.removeEventListener(type, listener), {
      once: true,
    })
  }

  let guestElement: GuestElement
  try {
    const reservation = await bridge.acquire(workspace)
    if (lifetime.signal.aborted) {
      await release(reservation.lease)
      return { dispose: cleanup }
    }
    lease = reservation.lease

    guestElement = options.createElement
      ? options.createElement()
      : (document.createElement('webview') as unknown as GuestElement)
    element = guestElement
    guestElement.className = 'dps-guestView'
    guestElement.setAttribute('src', `about:blank#${reservation.lease}`)
    guestElement.setAttribute('partition', reservation.partition)
    guestElement.setAttribute('name', reservation.lease)
    guestElement.setAttribute('allowpopups', '')
    guestElement.setAttribute('data-sidebar-browser-frame', 'webview')
    host.appendChild(guestElement)
  } catch (error) {
    if (!lifetime.signal.aborted) fail('embed-failed', messageOf(error))
    return { dispose: cleanup }
  }

  const retryAbortedLoad = (): void => {
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (disposed || element === null) return
      let current = ''
      try {
        current = element.getURL()
      } catch {
        current = ''
      }
      if (isHttpUrl(current)) return
      try {
        // A fresh src navigation avoids the rejected loadURL promise.
        element.setAttribute('src', url)
      } catch {
        // The load timeout reports a genuinely stuck guest.
      }
    }, ABORTED_RETRY_MS)
  }

  const beginLoad = (): void => {
    if (disposed || started) return
    started = true
    if (domReadyTimer !== null) clearTimeout(domReadyTimer)
    domReadyTimer = null
    loadTimer = setTimeout(() => fail('embed-timeout'), LOAD_TIMEOUT_MS)
    void element?.loadURL(url).catch((error: unknown) => {
      if (disposed) return
      if (isAbortedLoad(error)) {
        retryAbortedLoad()
        return
      }
      fail('embed-failed', messageOf(error))
    })
  }

  const finishLoading = (): void => {
    if (disposed || element === null) return
    let current = ''
    try {
      current = element.getURL()
    } catch {
      current = ''
    }
    if (!isHttpUrl(current)) return
    if (loadTimer !== null) clearTimeout(loadTimer)
    loadTimer = null
    onReady()
    try {
      element.focus()
    } catch {
      // Focus is best effort.
    }
  }

  listen(guestElement, 'dom-ready', () => beginLoad())
  listen(guestElement, 'did-navigate', finishLoading)
  listen(guestElement, 'did-stop-loading', finishLoading)
  listen(guestElement, 'did-fail-load', (event) => {
    const failure = event as Event & {
      isMainFrame?: boolean
      errorCode?: number
      errorDescription?: string
    }
    if (failure.isMainFrame === false) return
    if (failure.errorCode === -3) return
    fail(
      'embed-failed',
      failure.errorDescription !== undefined ? String(failure.errorDescription) : undefined,
    )
  })
  listen(guestElement, 'render-process-gone', () => fail('guest-gone'))
  listen(guestElement, 'destroyed', () => fail('guest-gone'))

  if (bridge.onOpenRequested !== undefined && lease !== null) {
    unsubscribeOpen = bridge.onOpenRequested(lease, (value) => {
      if (!disposed) openExternal(value)
    })
  }

  domReadyTimer = setTimeout(() => fail('embed-timeout'), DOM_READY_TIMEOUT_MS)
  return { dispose: cleanup }
}

/**
 * Release a guest during unmount, bounded by a short grace period so a stuck main
 * process cannot block the React teardown.
 * @param mounted - handle returned by {@link mountGuest}.
 */
export async function disposeGuest(mounted: MountedGuest): Promise<void> {
  await Promise.race([
    mounted.dispose(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, RELEASE_GRACE_MS)
    }),
  ])
}
