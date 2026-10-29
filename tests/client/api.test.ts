import { describe, expect, it, vi } from 'vitest'
import {
  ApiClientError,
  createApi,
  delay,
  isAbortError,
  isErrorResponse,
} from '../../src/client/api'
import { API_PREFIX, type ListResponse } from '../../src/shared/protocol'

/** Minimal Response-like object; the API only reads ok/status/text. */
function fakeResponse(body: unknown, status = 200): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as Response
}

function apiWith(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(handler)
  return { api: createApi(fetchImpl as unknown as typeof fetch), fetchImpl }
}

const LIST: ListResponse = {
  apiVersion: 1,
  current: { home: '/h', name: 'desktop' },
  homes: [],
  canLaunch: true,
  launcher: { kind: 'dsh' },
  limits: {
    startTimeoutMs: 1,
    pollIntervalMs: 1,
    maxPollIntervalMs: 1,
    keepaliveMs: 1,
    idleStopMs: 0,
  },
  diagnostics: [],
}

describe('createApi', () => {
  it('lists profiles with same-origin credentials and no cache', async () => {
    const { api, fetchImpl } = apiWith(() => fakeResponse(LIST))
    const signal = new AbortController().signal
    await expect(api.list(signal)).resolves.toEqual(LIST)
    expect(fetchImpl).toHaveBeenCalledWith(
      `${API_PREFIX}/list`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      }),
    )
  })

  it('posts JSON bodies for open and stop', async () => {
    const { api, fetchImpl } = apiWith((url) =>
      url.endsWith('/open')
        ? fakeResponse({ state: 'starting' }, 202)
        : fakeResponse({ state: 'idle', stopped: true }),
    )
    await expect(api.open('/h', 'web')).resolves.toEqual({ state: 'starting' })
    await expect(api.stop('/h', 'web')).resolves.toEqual({ state: 'idle', stopped: true })
    const openCall = fetchImpl.mock.calls[0]
    expect(openCall?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ home: '/h', name: 'web' }),
    })
  })

  it('encodes status query values', async () => {
    const { api, fetchImpl } = apiWith(() => fakeResponse({ state: 'ready', url: 'http://x/' }))
    await api.status('/Users/me/.dsh', 'web')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `${API_PREFIX}/status?home=${encodeURIComponent('/Users/me/.dsh')}&name=web`,
    )
  })

  it('maps host error codes', async () => {
    const cases: [number, unknown, string][] = [
      [404, { error: 'profile-not-found' }, 'profile-not-found'],
      [401, 'unauthorized', 'unauthorized'],
      [403, 'forbidden', 'unauthorized'],
      [404, 'not found', 'unsupported-host'],
      [413, { error: 'payload-too-large' }, 'payload-too-large'],
      [429, { error: 'too-many-profiles' }, 'too-many-profiles'],
      [503, { error: 'launcher-unavailable' }, 'launcher-unavailable'],
      [500, 'boom', 'internal-error'],
      [400, { error: 'made-up' }, 'request-failed'],
      [400, 'bad request', 'request-failed'],
    ]
    for (const [status, body, code] of cases) {
      const { api } = apiWith(() => fakeResponse(body, status))
      await expect(api.list()).rejects.toMatchObject({ name: 'ApiClientError', code, status })
    }
  })

  it('keeps the server detail', async () => {
    const { api } = apiWith(() => fakeResponse({ error: 'internal-error', detail: 'cause' }, 500))
    await expect(api.list()).rejects.toMatchObject({ detail: 'cause' })
  })

  it('turns transport failures into request-failed', async () => {
    const { api } = apiWith(() => {
      throw new Error('offline')
    })
    await expect(api.list()).rejects.toMatchObject({
      code: 'request-failed',
      status: 0,
      detail: 'offline',
    })
  })

  it('rethrows aborts', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const { api } = apiWith(() => {
      throw abort
    })
    await expect(api.list()).rejects.toBe(abort)
    expect(isAbortError(abort)).toBe(true)
  })

  it('rejects a successful response that is not a JSON object', async () => {
    const { api } = apiWith(() => fakeResponse('not json'))
    await expect(api.list()).rejects.toMatchObject({ code: 'request-failed' })
  })

  it('identifies error response bodies', () => {
    expect(isErrorResponse({ error: 'x' })).toBe(true)
    expect(isErrorResponse(null)).toBe(false)
    expect(isErrorResponse([])).toBe(false)
  })
})

describe('delay', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers()
    const signal = new AbortController().signal
    const result = delay(100, signal)
    await vi.advanceTimersByTimeAsync(100)
    await expect(result).resolves.toBeUndefined()
    vi.useRealTimers()
  })

  it('rejects when the signal aborts', async () => {
    const controller = new AbortController()
    const result = delay(1_000, controller.signal)
    controller.abort()
    await expect(result).rejects.toBeDefined()
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(delay(1_000, controller.signal)).rejects.toBeDefined()
  })
})

describe('ApiClientError', () => {
  it('keeps code, status, and detail', () => {
    const error = new ApiClientError('embed-failed', 500, 'detail')
    expect(error).toMatchObject({
      name: 'ApiClientError',
      code: 'embed-failed',
      status: 500,
      detail: 'detail',
    })
  })
})
