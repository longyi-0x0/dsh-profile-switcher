import type { StatusResponse } from '../shared/protocol'
import { ApiClientError, delay, isAbortError, type ProfileApi } from './api'
import type { ClientErrorCode } from './i18n'
import { sanitizeDetail } from './redact'
import type { Store } from './store'
import type { ClientState, MenuAnchor } from './state'

/** Dependencies injected by `apply`. */
export interface ControllerDeps {
  store: Store<ClientState>
  api: ProfileApi
  /** Whether `dshDesktop.browser` can host a leased webview. */
  canEmbed: boolean
  /** Open a URL in the system browser; returns false when the popup was blocked. */
  openExternal: (url: string) => boolean
  /** Restore focus to the brand trigger. */
  focusTrigger: () => void
}

/** @param error - unknown thrown value. @returns its detail text. */
function detailOf(error: unknown): string | undefined {
  if (error instanceof ApiClientError) return sanitizeDetail(error.detail)
  if (error instanceof Error) return sanitizeDetail(error.message)
  return undefined
}

/** @param error - unknown thrown value. @returns a renderable code. */
function codeOf(error: unknown): ClientErrorCode {
  return error instanceof ApiClientError ? error.code : 'request-failed'
}

/**
 * Owns the menu and overlay state machine.
 *
 * The React components are thin: they call these methods and render the snapshot.
 * Every asynchronous flow is guarded by a monotonically increasing token plus an
 * `AbortController`, so a late response from a cancelled open cannot overwrite the
 * current state.
 */
export class ProfileController {
  private readonly deps: ControllerDeps
  private sequence = 0
  private abort: AbortController | null = null
  private keepalive: ReturnType<typeof setInterval> | null = null
  private disposed = false
  private listSequence = 0

  /** @param deps - store, API, and playback capabilities. */
  constructor(deps: ControllerDeps) {
    this.deps = deps
  }

  /** @returns the current snapshot. */
  get state(): ClientState {
    return this.deps.store.getSnapshot()
  }

  /**
   * Open the menu and refresh the profile list.
   * @param anchor - trigger rectangle.
   */
  openMenu(anchor: MenuAnchor): void {
    this.deps.store.update({ menuOpen: true, anchor, notice: null })
    void this.loadProfiles()
  }

  /**
   * Close the menu.
   * @param restoreFocus - whether to focus the trigger (Escape only).
   */
  closeMenu(restoreFocus = false): void {
    if (!this.state.menuOpen) return
    this.deps.store.update({ menuOpen: false })
    if (restoreFocus) this.deps.focusTrigger()
  }

  /** Refresh the listing shown in the menu. */
  async loadProfiles(): Promise<void> {
    const token = ++this.listSequence
    this.deps.store.update({ menuLoading: true, menuError: null })
    try {
      const payload = await this.deps.api.list()
      if (this.disposed || token !== this.listSequence) return
      const currentHome = payload.homes.find((home) => home.current) ?? null
      const currentProfile = currentHome?.profiles.find((profile) => profile.current) ?? null
      this.deps.store.update({
        homes: payload.homes,
        canLaunch: payload.canLaunch,
        currentName: currentProfile?.name ?? '',
        currentHome: currentHome?.path ?? null,
        launcherKind: payload.launcher?.kind ?? null,
        diagnostics: payload.diagnostics,
        limits: payload.limits,
        menuLoading: false,
        menuError: null,
      })
    } catch (error) {
      if (this.disposed || token !== this.listSequence || isAbortError(error)) return
      const detail = sanitizeDetail(detailOf(error))
      this.deps.store.update({
        menuLoading: false,
        menuError: {
          code: codeOf(error),
          ...(detail === undefined ? {} : { detail }),
        },
      })
    }
  }

  /**
   * Start one target profile and drive it to the embedded (or new-tab) surface.
   * @param home - allow-listed home path.
   * @param name - profile name.
   */
  async beginSelect(home: string, name: string): Promise<void> {
    const state = this.state
    if (state.phase === 'starting' || state.phase === 'embedded') return

    const token = ++this.sequence
    this.abort?.abort()
    const controller = new AbortController()
    this.abort = controller
    this.deps.store.update({
      menuOpen: false,
      phase: 'starting',
      target: { home, name },
      url: null,
      errorCode: null,
      errorDetail: null,
      guestLoading: false,
      notice: null,
    })
    await this.runStart(token, home, name, controller.signal)
  }

  /** Retry the target that failed. */
  async retry(): Promise<void> {
    const target = this.state.target
    if (target === null) return
    await this.beginSelect(target.home, target.name)
  }

  /** Leave the overlay, release the server, and restore focus. */
  returnToApp(): void {
    const target = this.state.target
    this.sequence += 1
    this.abort?.abort()
    this.abort = null
    this.stopKeepalive()
    this.deps.store.update({
      phase: 'idle',
      target: null,
      url: null,
      errorCode: null,
      errorDetail: null,
      guestLoading: false,
    })
    if (target !== null) void this.apiStop(target.home, target.name)
    this.deps.focusTrigger()
  }

  /** Open the current target URL in the system browser. */
  openInTab(): void {
    const url = this.state.url
    if (url === null) return
    if (!this.deps.openExternal(url)) {
      this.stopKeepalive()
      this.deps.store.update({ phase: 'error', errorCode: 'popup-blocked', errorDetail: null })
    }
  }

  /** Called when the guest committed its first document. */
  guestReady(): void {
    if (this.state.phase !== 'embedded') return
    this.deps.store.update({ guestLoading: false })
  }

  /**
   * Called when the guest fails after it was mounted.
   * @param code - renderable failure code.
   * @param detail - optional detail.
   */
  guestFailure(code: ClientErrorCode, detail?: string): void {
    if (this.state.phase !== 'embedded') return
    this.stopKeepalive()
    this.deps.store.update({
      phase: 'error',
      guestLoading: false,
      errorCode: code,
      errorDetail: sanitizeDetail(detail) ?? null,
    })
  }

  /** Invalidate in-flight work and release timers on plugin unload. */
  dispose(): void {
    this.disposed = true
    this.sequence += 1
    this.listSequence += 1
    this.abort?.abort()
    this.abort = null
    this.stopKeepalive()
  }

  // --- internals -------------------------------------------------------------

  /** @param token - flow token captured at start. */
  private isCurrent(token: number): boolean {
    return !this.disposed && token === this.sequence
  }

  /**
   * @param token - flow token.
   * @param home - home.
   * @param name - profile name.
   * @param signal - cancellation signal.
   */
  private async runStart(
    token: number,
    home: string,
    name: string,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const opened = await this.deps.api.open(home, name, signal)
      if (!this.isCurrent(token)) {
        void this.apiStop(home, name)
        return
      }
      if (opened.state === 'error') {
        this.fail(token, opened.error ?? 'spawn-failed', opened.detail)
        return
      }
      if (opened.state === 'ready' && opened.url !== undefined) {
        this.enter(token, home, name, opened.url)
        return
      }
      await this.pollUntilReady(token, home, name, signal)
    } catch (error) {
      if (isAbortError(error) || !this.isCurrent(token)) return
      this.fail(token, codeOf(error), detailOf(error))
    }
  }

  /**
   * @param token - flow token.
   * @param home - home.
   * @param name - profile name.
   * @param signal - cancellation signal.
   */
  private async pollUntilReady(
    token: number,
    home: string,
    name: string,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + this.state.limits.startTimeoutMs
    let wait = this.state.limits.pollIntervalMs
    for (;;) {
      await delay(wait, signal)
      if (!this.isCurrent(token)) return
      const status: StatusResponse = await this.deps.api.status(home, name, signal)
      if (!this.isCurrent(token)) return
      if (status.state === 'ready' && status.url !== undefined) {
        this.enter(token, home, name, status.url)
        return
      }
      if (status.state === 'error') {
        this.fail(token, status.error ?? 'spawn-failed', status.detail)
        return
      }
      if (status.state === 'idle') {
        this.fail(token, 'server-stopped')
        return
      }
      if (Date.now() >= deadline) {
        this.fail(token, 'start-timeout')
        void this.apiStop(home, name)
        return
      }
      const limits = this.state.limits
      wait = Math.min(
        limits.maxPollIntervalMs,
        Math.max(limits.pollIntervalMs, Math.round(wait * 1.5)),
      )
    }
  }

  /**
   * @param token - flow token.
   * @param home - home.
   * @param name - profile name.
   * @param url - authenticated launch URL.
   */
  private enter(token: number, home: string, name: string, url: string): void {
    if (!this.isCurrent(token)) return
    if (!this.deps.canEmbed) {
      if (!this.deps.openExternal(url)) {
        this.fail(token, 'popup-blocked')
        return
      }
      // The new tab owns the server now; idle recovery stops it after the tab closes.
      this.deps.store.update({
        phase: 'idle',
        target: null,
        url: null,
        guestLoading: false,
        notice: 'web-fallback',
      })
      this.sequence += 1
      return
    }
    this.deps.store.update({
      phase: 'embedded',
      url,
      guestLoading: true,
      errorCode: null,
      errorDetail: null,
    })
    this.startKeepalive(home, name, token)
  }

  /**
   * @param token - flow token.
   * @param code - failure code.
   * @param detail - optional detail.
   */
  private fail(token: number, code: ClientErrorCode, detail?: string): void {
    if (!this.isCurrent(token)) return
    this.stopKeepalive()
    this.deps.store.update({
      phase: 'error',
      guestLoading: false,
      errorCode: code,
      errorDetail: sanitizeDetail(detail) ?? null,
    })
  }

  /**
   * @param home - home.
   * @param name - profile name.
   * @param token - flow token.
   */
  private startKeepalive(home: string, name: string, token: number): void {
    this.stopKeepalive()
    const interval = this.state.limits.keepaliveMs
    this.keepalive = setInterval(() => {
      void this.checkAlive(home, name, token)
    }, interval)
  }

  private stopKeepalive(): void {
    if (this.keepalive === null) return
    clearInterval(this.keepalive)
    this.keepalive = null
  }

  /**
   * @param home - home.
   * @param name - profile name.
   * @param token - flow token.
   */
  private async checkAlive(home: string, name: string, token: number): Promise<void> {
    if (!this.isCurrent(token) || this.state.phase !== 'embedded') return
    let status: StatusResponse
    try {
      status = await this.deps.api.status(home, name)
    } catch {
      // A transient transport failure must not tear down a working guest.
      return
    }
    if (!this.isCurrent(token) || this.state.phase !== 'embedded') return
    if (status.state === 'ready') return
    if (status.state === 'error') {
      this.guestFailure(status.error ?? 'exited', status.detail)
      return
    }
    if (status.state === 'idle') this.guestFailure('server-stopped')
  }

  /**
   * Stop a server without surfacing failures; idle recovery is the fallback.
   * @param home - home.
   * @param name - profile name.
   */
  private async apiStop(home: string, name: string): Promise<void> {
    try {
      await this.deps.api.stop(home, name)
    } catch {
      // The host sweep or the next open cleans it up.
    }
  }
}
