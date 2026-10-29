/**
 * Desktop preload bridge exposed to the `dsh-app://app` page.
 *
 * This is a versioned but internal Desktop contract: only a reservation issued by
 * `dshDesktop.browser.acquire()` may attach a `<webview>` (the main process rejects
 * every other guest). The plugin degrades to opening a browser tab when it is absent.
 */
interface DpsBrowserReservation {
  readonly lease: string
  readonly partition: string
}

interface DpsBrowserBridge {
  acquire(workspace: string): Promise<DpsBrowserReservation>
  release(lease: string): Promise<void> | void
  onOpenRequested?(lease: string, listener: (url: string) => void): () => void
}

interface DpsDesktopBridge {
  readonly protocolVersion: number
  readonly browser?: DpsBrowserBridge
}

interface Window {
  dshDesktop?: DpsDesktopBridge
}
