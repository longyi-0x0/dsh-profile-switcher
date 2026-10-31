import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, type ProfileApi } from '../../src/client/api'
import { ProfileController } from '../../src/client/controller'
import { createStore } from '../../src/client/store'
import { INITIAL_STATE } from '../../src/client/state'
import type { ListResponse, StatusResponse } from '../../src/shared/protocol'

const HOME = '/Users/tester/.dsh'
const URL = 'http://127.0.0.1:4321/?token=secret'

function listing(overrides: Partial<ListResponse> = {}): ListResponse {
  return {
    apiVersion: 1,
    current: { home: HOME, name: 'desktop' },
    homes: [
      {
        path: HOME,
        label: '~/.dsh',
        current: true,
        profiles: [
          { name: 'desktop', current: true, state: 'idle', bundles: 2, deletable: false },
          { name: 'web', current: false, state: 'idle', bundles: 1, deletable: true },
        ],
      },
    ],
    canLaunch: true,
    canOpenWindow: true,
    launcher: { kind: 'desktop-cli' },
    limits: {
      startTimeoutMs: 500,
      pollIntervalMs: 10,
      maxPollIntervalMs: 20,
      keepaliveMs: 50,
      idleStopMs: 0,
    },
    diagnostics: [],
    ...overrides,
  }
}

function createHarness(
  options: {
    canEmbed?: boolean
    openExternal?: boolean
    open?: (home: string, name: string, signal?: AbortSignal) => Promise<StatusResponse>
    status?: (home: string, name: string, signal?: AbortSignal) => Promise<StatusResponse>
    list?: () => Promise<ListResponse>
    create?: (home: string, name: string) => Promise<{ created: true }>
    remove?: (home: string, name: string) => Promise<{ deleted: true }>
    openWindow?: (home: string, name: string) => Promise<{ opened: boolean }>
  } = {},
) {
  const api: ProfileApi = {
    list: vi.fn(options.list ?? (async () => listing())),
    open: vi.fn(options.open ?? (async (): Promise<StatusResponse> => ({ state: 'starting' }))),
    status: vi.fn(
      options.status ?? (async (): Promise<StatusResponse> => ({ state: 'ready', url: URL })),
    ),
    stop: vi.fn(async () => ({ state: 'idle' as const, stopped: true })),
    create: vi.fn(options.create ?? (async () => ({ created: true as const }))),
    remove: vi.fn(options.remove ?? (async () => ({ deleted: true as const }))),
    openWindow: vi.fn(options.openWindow ?? (async () => ({ opened: true as const }))),
  }
  const store = createStore({
    ...INITIAL_STATE,
    limits: {
      startTimeoutMs: 500,
      pollIntervalMs: 10,
      maxPollIntervalMs: 20,
      keepaliveMs: 50,
      idleStopMs: 0,
    },
  })
  const focusTrigger = vi.fn()
  const openExternal = vi.fn(() => options.openExternal ?? true)
  const controller = new ProfileController({
    store,
    api,
    canEmbed: options.canEmbed ?? true,
    openExternal,
    focusTrigger,
  })
  controllers.push(controller)
  return { api, store, controller, focusTrigger, openExternal }
}

const controllers: ProfileController[] = []

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose()
  vi.useRealTimers()
})

describe('ProfileController', () => {
  it('loads the listing into the store', async () => {
    const { controller, store } = createHarness()
    await controller.loadProfiles()
    const state = store.getSnapshot()
    expect(state.homes).toHaveLength(1)
    expect(state.currentName).toBe('desktop')
    expect(state.canLaunch).toBe(true)
    expect(state.launcherKind).toBe('desktop-cli')
    expect(state.menuLoading).toBe(false)
    expect(state.limits.pollIntervalMs).toBe(10)
  })

  it('records a localized list failure', async () => {
    const { controller, store } = createHarness({
      list: async () => {
        throw new ApiClientError('unsupported-host', 404)
      },
    })
    await controller.loadProfiles()
    expect(store.getSnapshot().menuError).toEqual({ code: 'unsupported-host' })
    expect(store.getSnapshot().menuLoading).toBe(false)
  })

  it('tolerates a listing from an older Host without limits or diagnostics', async () => {
    const legacy = listing()
    delete (legacy as Partial<ListResponse>).limits
    delete (legacy as Partial<ListResponse>).diagnostics
    const { controller, store } = createHarness({
      list: async () => legacy,
    })
    const limitsBefore = store.getSnapshot().limits
    await controller.loadProfiles()
    expect(store.getSnapshot().limits).toEqual(limitsBefore)
    expect(store.getSnapshot().diagnostics).toEqual([])
    expect(store.getSnapshot().homes).toHaveLength(1)
  })

  it('opens and closes the menu, focusing only when asked', () => {
    const { controller, store, focusTrigger } = createHarness()
    controller.openMenu({ left: 1, top: 2, bottom: 3 })
    expect(store.getSnapshot().menuOpen).toBe(true)
    expect(store.getSnapshot().anchor).toEqual({ left: 1, top: 2, bottom: 3 })
    controller.closeMenu(false)
    expect(store.getSnapshot().menuOpen).toBe(false)
    expect(focusTrigger).not.toHaveBeenCalled()
    controller.openMenu({ left: 0, top: 0, bottom: 0 })
    controller.closeMenu(true)
    expect(focusTrigger).toHaveBeenCalledTimes(1)
  })

  it('embeds immediately when open reports ready', async () => {
    const { controller, store } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    expect(store.getSnapshot()).toMatchObject({
      phase: 'embedded',
      url: URL,
      guestLoading: true,
      target: { home: HOME, name: 'web' },
    })
  })

  it('polls until ready', async () => {
    vi.useFakeTimers()
    const { controller, store, api } = createHarness()
    const promise = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10)
    await promise
    expect(api.status).toHaveBeenCalled()
    expect(store.getSnapshot().phase).toBe('embedded')
    expect(store.getSnapshot().url).toBe(URL)
  })

  it('surfaces a runtime error from status', async () => {
    vi.useFakeTimers()
    const { controller, store } = createHarness({
      status: async () => ({
        state: 'error',
        error: 'exited',
        detail: 'code 1 at http://127.0.0.1:4321/?token=secret',
      }),
    })
    const promise = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(10)
    await promise
    expect(store.getSnapshot().phase).toBe('error')
    expect(store.getSnapshot().errorCode).toBe('exited')
    expect(store.getSnapshot().errorDetail).toContain('code 1')
    expect(store.getSnapshot().errorDetail).not.toContain('secret')
  })

  it('treats an idle status during startup as stopped', async () => {
    vi.useFakeTimers()
    const { controller, store } = createHarness({
      status: async () => ({ state: 'idle' }),
    })
    const promise = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(10)
    await promise
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'server-stopped' })
  })

  it('times out, reports start-timeout, and stops the server', async () => {
    vi.useFakeTimers()
    const { controller, store, api } = createHarness({
      status: async () => ({ state: 'starting' }),
    })
    const promise = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(600)
    await promise
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'start-timeout' })
    expect(api.stop).toHaveBeenCalledWith(HOME, 'web')
  })

  it('cancels an in-flight start when returning to the app', async () => {
    vi.useFakeTimers()
    const { controller, store, api } = createHarness()
    const promise = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(0)
    controller.returnToApp()
    await promise
    expect(store.getSnapshot().phase).toBe('idle')
    expect(api.stop).toHaveBeenCalledWith(HOME, 'web')
  })

  it('retries the failed target', async () => {
    vi.useFakeTimers()
    let attempt = 0
    const { controller, store } = createHarness({
      status: async () => {
        attempt += 1
        return attempt === 1
          ? { state: 'error', error: 'spawn-failed' }
          : { state: 'ready', url: URL }
      },
    })
    const first = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(10)
    await first
    expect(store.getSnapshot().phase).toBe('error')
    const retry = controller.retry()
    await vi.advanceTimersByTimeAsync(10)
    await retry
    expect(store.getSnapshot().phase).toBe('embedded')
  })

  it('opens a browser tab when embedding is unavailable and keeps the server', async () => {
    const { controller, store, openExternal, api } = createHarness({
      canEmbed: false,
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    expect(openExternal).toHaveBeenCalledWith(URL)
    expect(store.getSnapshot()).toMatchObject({ phase: 'idle', notice: 'web-fallback' })
    expect(api.stop).not.toHaveBeenCalled()
  })

  it('reports a blocked popup', async () => {
    const { controller, store } = createHarness({
      canEmbed: false,
      openExternal: false,
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'popup-blocked' })
  })

  it('returns to the app, stops the server, and restores focus', async () => {
    const { controller, store, api, focusTrigger } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    controller.returnToApp()
    expect(store.getSnapshot()).toMatchObject({ phase: 'idle', target: null, url: null })
    expect(api.stop).toHaveBeenCalledWith(HOME, 'web')
    expect(focusTrigger).toHaveBeenCalled()
  })

  it('detects a server that stopped while embedded', async () => {
    vi.useFakeTimers()
    const { controller, store, api } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
      status: async () => ({ state: 'idle' }),
    })
    await controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(50)
    expect(api.status).toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'server-stopped' })
  })

  it('ignores transient heartbeat failures', async () => {
    vi.useFakeTimers()
    const { controller, store } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
      status: async () => {
        throw new Error('offline')
      },
    })
    await controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(50)
    expect(store.getSnapshot().phase).toBe('embedded')
  })

  it('clears the loading flag when the guest reports ready', async () => {
    const { controller, store } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    controller.guestReady()
    expect(store.getSnapshot().guestLoading).toBe(false)
  })

  it('shows a guest failure', async () => {
    const { controller, store } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    controller.guestFailure('embed-failed', 'GET http://127.0.0.1:4321/?token=secret failed')
    const state = store.getSnapshot()
    expect(state).toMatchObject({ phase: 'error', errorCode: 'embed-failed' })
    expect(state.errorDetail).toContain('http://127.0.0.1:4321')
    expect(state.errorDetail).not.toContain('secret')
  })

  it('creates a profile and refreshes the listing', async () => {
    const { controller, store, api } = createHarness()
    const created = await controller.createProfile(HOME, 'lab')
    expect(created).toBe(true)
    expect(api.create).toHaveBeenCalledWith(HOME, 'lab')
    expect(api.list).toHaveBeenCalled()
    expect(store.getSnapshot().mutation).toBeNull()
  })

  it('reports a failed creation and keeps the draft in the store', async () => {
    const { controller, store } = createHarness({
      create: async () => {
        throw new ApiClientError('profile-exists', 409)
      },
    })
    const created = await controller.createProfile(HOME, 'web')
    expect(created).toBe(false)
    expect(store.getSnapshot().mutation).toEqual({
      kind: 'create',
      name: 'web',
      busy: false,
      error: { code: 'profile-exists' },
    })
    expect(store.getSnapshot().menuLoading).toBe(false)
  })

  it('drops a failed mutation when the menu reopens but keeps a running one', () => {
    const { controller, store } = createHarness()
    const anchor = { left: 0, top: 0, bottom: 0 }
    store.update({
      mutation: { kind: 'create', name: 'web', busy: false, error: { code: 'profile-exists' } },
    })
    controller.openMenu(anchor)
    expect(store.getSnapshot().mutation).toBeNull()

    store.update({ mutation: { kind: 'create', name: 'lab', busy: true, error: null } })
    controller.openMenu(anchor)
    expect(store.getSnapshot().mutation).toMatchObject({ name: 'lab', busy: true })
  })

  it('opens the create dialog and closes it on success or request', async () => {
    const { controller, store } = createHarness()
    controller.openCreate()
    expect(store.getSnapshot()).toMatchObject({ createOpen: true, menuOpen: false })
    const created = await controller.createProfile(HOME, 'lab')
    expect(created).toBe(true)
    expect(store.getSnapshot().createOpen).toBe(false)

    controller.openCreate()
    controller.closeCreate()
    expect(store.getSnapshot().createOpen).toBe(false)
  })

  it('opens a real browser window through the Host', async () => {
    const { controller, store, api, openExternal } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
    })
    await controller.beginSelect(HOME, 'web')
    await controller.openInWindow()
    expect(api.openWindow).toHaveBeenCalledWith(HOME, 'web')
    expect(openExternal).not.toHaveBeenCalled()
    expect(store.getSnapshot().notice).toBeNull()
  })

  it('falls back to the browser and announces it when no window opens', async () => {
    const { controller, store, openExternal } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
      openWindow: async () => ({ opened: false }),
    })
    await controller.beginSelect(HOME, 'web')
    await controller.openInWindow()
    expect(openExternal).toHaveBeenCalledWith(URL)
    expect(store.getSnapshot().notice).toBe('window-fallback')
    expect(store.getSnapshot().phase).toBe('embedded')
  })

  it('falls back to the browser when the window request fails', async () => {
    const { controller, store, openExternal } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
      openWindow: async () => {
        throw new ApiClientError('profile-not-ready', 409)
      },
    })
    await controller.beginSelect(HOME, 'web')
    await controller.openInWindow()
    expect(openExternal).toHaveBeenCalledWith(URL)
    expect(store.getSnapshot().notice).toBe('window-fallback')
  })

  it('deletes a profile and refreshes the listing', async () => {
    const { controller, store, api } = createHarness()
    const deleted = await controller.deleteProfile(HOME, 'web')
    expect(deleted).toBe(true)
    expect(api.remove).toHaveBeenCalledWith(HOME, 'web')
    expect(api.list).toHaveBeenCalled()
    expect(store.getSnapshot().mutation).toBeNull()
  })

  it('reports a refused deletion with its sanitized detail', async () => {
    const { controller, store } = createHarness({
      remove: async () => {
        throw new ApiClientError('profile-delete-failed', 500, 'EACCES http://x/?token=secret')
      },
    })
    await expect(controller.deleteProfile(HOME, 'web')).resolves.toBe(false)
    const mutation = store.getSnapshot().mutation
    expect(mutation?.error?.code).toBe('profile-delete-failed')
    expect(mutation?.error?.detail).toContain('http://x')
    expect(mutation?.error?.detail).not.toContain('secret')
  })

  it('opens the current URL in the browser, or reports a blocked popup', async () => {
    const { controller, store, openExternal } = createHarness({
      open: async () => ({ state: 'ready', url: URL }),
      openExternal: false,
    })
    await controller.beginSelect(HOME, 'web')
    controller.openInBrowser()
    expect(openExternal).toHaveBeenCalledWith(URL)
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'popup-blocked' })
  })

  it('stops updating after dispose', async () => {
    vi.useFakeTimers()
    const { controller, store } = createHarness()
    const promise = controller.beginSelect(HOME, 'web')
    await vi.advanceTimersByTimeAsync(0)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(50)
    await promise.catch(() => undefined)
    expect(store.getSnapshot().phase).toBe('starting')
  })
})
