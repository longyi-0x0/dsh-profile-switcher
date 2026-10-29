import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { ProfileController } from '../../src/client/controller'
import type { ProfileApi } from '../../src/client/api'
import { RuntimeProvider } from '../../src/client/runtime'
import { createStore } from '../../src/client/store'
import { INITIAL_STATE, type ClientState } from '../../src/client/state'
import type { ListResponse, StatusResponse } from '../../src/shared/protocol'

export const HOME = '/Users/tester/.dsh'
export const PROFILE_URL = 'http://127.0.0.1:4321/?token=secret'

/** @param overrides - list response overrides. */
export function listing(overrides: Partial<ListResponse> = {}): ListResponse {
  return {
    apiVersion: 1,
    current: { home: HOME, name: 'desktop' },
    homes: [
      {
        path: HOME,
        label: '~/.dsh',
        current: true,
        profiles: [
          { name: 'desktop', current: true, state: 'idle', bundles: 2 },
          { name: 'web', current: false, state: 'idle', bundles: 1 },
          { name: 'trading', current: false, state: 'ready', bundles: 3 },
        ],
      },
    ],
    canLaunch: true,
    launcher: { kind: 'desktop-cli' },
    limits: {
      startTimeoutMs: 1_000,
      pollIntervalMs: 10,
      maxPollIntervalMs: 20,
      keepaliveMs: 50,
      idleStopMs: 0,
    },
    diagnostics: [],
    ...overrides,
  }
}

/** Test runtime with a real controller and a fake API. */
export function createTestRuntime(
  options: {
    state?: Partial<ClientState>
    api?: Partial<ProfileApi>
    canEmbed?: boolean
    openExternal?: boolean
  } = {},
) {
  const api: ProfileApi = {
    list: vi.fn(async () => listing()),
    open: vi.fn(async (): Promise<StatusResponse> => ({ state: 'starting' })),
    status: vi.fn(async (): Promise<StatusResponse> => ({ state: 'ready', url: PROFILE_URL })),
    stop: vi.fn(async () => ({ state: 'idle' as const, stopped: true })),
    ...options.api,
  }
  const store = createStore({ ...INITIAL_STATE, ...options.state })
  const focusTrigger = vi.fn()
  const openExternal = vi.fn(() => options.openExternal ?? true)
  const controller = new ProfileController({
    store,
    api,
    canEmbed: options.canEmbed ?? true,
    openExternal,
    focusTrigger,
  })
  const runtime = { store, controller, translate: undefined }

  return {
    api,
    store,
    controller,
    focusTrigger,
    openExternal,
    render(ui: ReactElement): RenderResult {
      return render(<RuntimeProvider runtime={runtime}>{ui}</RuntimeProvider>)
    },
  }
}
