import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ABORTED_RETRY_MS,
  DOM_READY_TIMEOUT_MS,
  LOAD_TIMEOUT_MS,
  isAbortedLoad,
  mountGuest,
  type GuestBridge,
  type GuestElement,
  type GuestFailure,
  type MountedGuest,
} from '../../src/client/embed'

const URL = 'http://127.0.0.1:4321/?token=secret'
const WORKSPACE = 'profile-switcher'

interface Harness {
  element: GuestElement
  host: HTMLDivElement
  bridge: GuestBridge
  failure: ReturnType<typeof vi.fn<(failure: GuestFailure) => void>>
  ready: ReturnType<typeof vi.fn<() => void>>
  openExternal: ReturnType<typeof vi.fn<(url: string) => void>>
  mount: (signal?: AbortSignal) => Promise<MountedGuest>
  emit: (type: string, props?: Record<string, unknown>) => void
}

const disposers: (() => Promise<void>)[] = []

function emitTo(element: GuestElement, type: string, props?: Record<string, unknown>): void {
  const event = new Event(type)
  if (props !== undefined) Object.assign(event, props)
  element.dispatchEvent(event)
}

function harness(
  overrides: {
    acquire?: GuestBridge['acquire']
    loadURL?: (url: string) => Promise<void>
  } = {},
): Harness {
  const element = document.createElement('div') as unknown as GuestElement
  element.loadURL = vi.fn(overrides.loadURL ?? (async () => undefined))
  element.getURL = vi.fn(() => 'about:blank')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const bridge: GuestBridge = {
    acquire: vi.fn(
      overrides.acquire ?? (async () => ({ lease: 'lease-1', partition: 'persist:1' })),
    ),
    release: vi.fn(async () => undefined),
    onOpenRequested: vi.fn(() => () => undefined),
  }
  const failure = vi.fn<(failure: GuestFailure) => void>()
  const ready = vi.fn<() => void>()
  const openExternal = vi.fn<(url: string) => void>()
  const mount = (signal = new AbortController().signal): Promise<MountedGuest> =>
    mountGuest({
      bridge,
      host,
      url: URL,
      workspace: WORKSPACE,
      signal,
      openExternal,
      onReady: ready,
      onFailure: failure,
      createElement: () => element,
    })
  return {
    element,
    host,
    bridge,
    failure,
    ready,
    openExternal,
    mount,
    emit: (type, props) => emitTo(element, type, props),
  }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function track(mounted: MountedGuest): void {
  disposers.push(() => mounted.dispose())
}

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('isAbortedLoad', () => {
  it('recognizes both structured and wrapped aborts', () => {
    expect(isAbortedLoad({ code: 'ERR_ABORTED' })).toBe(true)
    expect(isAbortedLoad({ code: -3 })).toBe(true)
    expect(isAbortedLoad(new Error('net::ERR_ABORTED (-3)'))).toBe(true)
    expect(isAbortedLoad(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(false)
  })
})

describe('mountGuest', () => {
  it('configures the guest with the official leased attributes', async () => {
    const test = harness()
    track(await test.mount())
    expect(test.element.getAttribute('src')).toBe('about:blank#lease-1')
    expect(test.element.getAttribute('partition')).toBe('persist:1')
    expect(test.element.getAttribute('name')).toBe('lease-1')
    expect(test.element.getAttribute('allowpopups')).toBe('')
    expect(test.element.getAttribute('data-sidebar-browser-frame')).toBe('webview')
    expect(test.element.className).toBe('dps-guestView')
    expect(test.host.contains(test.element)).toBe(true)
    // The token URL never reaches an attribute.
    for (const attribute of test.element.getAttributeNames()) {
      expect(test.element.getAttribute(attribute)).not.toContain('secret')
    }
  })

  it('navigates once after dom-ready and reports ready on the committed URL', async () => {
    const test = harness()
    track(await test.mount())
    test.emit('dom-ready')
    test.emit('dom-ready')
    expect(test.element.loadURL).toHaveBeenCalledTimes(1)
    expect(test.element.loadURL).toHaveBeenCalledWith(URL)
    test.element.getURL = vi.fn(() => 'http://127.0.0.1:4321/')
    test.emit('did-stop-loading')
    expect(test.ready).toHaveBeenCalled()
  })

  it('does not report ready for the initial about:blank document', async () => {
    const test = harness()
    track(await test.mount())
    test.emit('dom-ready')
    test.emit('did-navigate')
    expect(test.ready).not.toHaveBeenCalled()
  })

  it('removes the element and releases the lease exactly once', async () => {
    const test = harness()
    const mounted = await test.mount()
    await mounted.dispose()
    await mounted.dispose()
    expect(test.host.contains(test.element)).toBe(false)
    expect(test.bridge.release).toHaveBeenCalledTimes(1)
    expect(test.bridge.release).toHaveBeenCalledWith('lease-1')
  })

  it('cleans up and reports nothing when the lifetime aborts', async () => {
    const test = harness()
    const abort = new AbortController()
    const mounted = await test.mount(abort.signal)
    abort.abort()
    await flush()
    expect(test.host.contains(test.element)).toBe(false)
    expect(test.bridge.release).toHaveBeenCalledWith('lease-1')
    expect(test.failure).not.toHaveBeenCalled()
    track(mounted)
  })

  it('reports a failed acquisition', async () => {
    const test = harness({
      acquire: async () => {
        throw new Error('lease denied')
      },
    })
    track(await test.mount())
    await flush()
    expect(test.failure).toHaveBeenCalledWith({ code: 'embed-failed', detail: 'lease denied' })
  })

  it('releases the lease when the lifetime aborts during acquisition', async () => {
    let resolveAcquire: ((value: { lease: string; partition: string }) => void) | undefined
    const test = harness({
      acquire: () =>
        new Promise((resolve) => {
          resolveAcquire = resolve
        }),
    })
    const abort = new AbortController()
    const mountedPromise = test.mount(abort.signal)
    abort.abort()
    resolveAcquire?.({ lease: 'late-lease', partition: 'persist:late' })
    const mounted = await mountedPromise
    track(mounted)
    await flush()
    expect(test.bridge.release).toHaveBeenCalledWith('late-lease')
    expect(test.failure).not.toHaveBeenCalled()
    expect(test.host.contains(test.element)).toBe(false)
  })

  it('times out waiting for dom-ready', async () => {
    vi.useFakeTimers()
    const test = harness()
    track(await test.mount())
    await vi.advanceTimersByTimeAsync(DOM_READY_TIMEOUT_MS)
    await flush()
    expect(test.failure).toHaveBeenCalledWith({ code: 'embed-timeout' })
    expect(test.bridge.release).toHaveBeenCalledWith('lease-1')
  })

  it('times out waiting for the target document', async () => {
    vi.useFakeTimers()
    const test = harness()
    track(await test.mount())
    test.emit('dom-ready')
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
    await flush()
    expect(test.failure).toHaveBeenCalledWith({ code: 'embed-timeout' })
  })

  it('ignores aborted and sub-frame load failures', async () => {
    const test = harness()
    track(await test.mount())
    test.emit('dom-ready')
    test.emit('did-fail-load', { errorCode: -3, isMainFrame: true })
    test.emit('did-fail-load', { errorCode: -105, isMainFrame: false })
    await flush()
    expect(test.failure).not.toHaveBeenCalled()
  })

  it('reports a genuine load failure with its description', async () => {
    const test = harness()
    track(await test.mount())
    test.emit('dom-ready')
    test.emit('did-fail-load', {
      errorCode: -105,
      isMainFrame: true,
      errorDescription: 'NAME_NOT_RESOLVED',
    })
    await flush()
    expect(test.failure).toHaveBeenCalledWith({
      code: 'embed-failed',
      detail: 'NAME_NOT_RESOLVED',
    })
  })

  it('reports a crashed guest', async () => {
    const test = harness()
    track(await test.mount())
    test.emit('render-process-gone')
    await flush()
    expect(test.failure).toHaveBeenCalledWith({ code: 'guest-gone' })
  })

  it('retries an aborted loadURL through the src attribute', async () => {
    vi.useFakeTimers()
    const test = harness({
      loadURL: async () => {
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      },
    })
    track(await test.mount())
    test.emit('dom-ready')
    await flush()
    expect(test.failure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(ABORTED_RETRY_MS)
    expect(test.element.getAttribute('src')).toBe(URL)
  })

  it('reports a non-aborted loadURL rejection', async () => {
    const test = harness({
      loadURL: async () => {
        throw new Error('blocked by navigation policy')
      },
    })
    track(await test.mount())
    test.emit('dom-ready')
    await flush()
    expect(test.failure).toHaveBeenCalledWith({
      code: 'embed-failed',
      detail: 'blocked by navigation policy',
    })
  })

  it('forwards guest popup requests to the browser', async () => {
    const test = harness()
    track(await test.mount())
    const onOpenRequested = vi.mocked(test.bridge.onOpenRequested)
    if (onOpenRequested === undefined) throw new Error('no open-request hook')
    const listener = onOpenRequested.mock.calls[0]?.[1]
    if (listener === undefined) throw new Error('no open-request listener')
    listener('http://example.com/')
    expect(test.openExternal).toHaveBeenCalledWith('http://example.com/')
  })
})
