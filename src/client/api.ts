import {
  API_PREFIX,
  type ErrorResponse,
  type ListResponse,
  type StatusResponse,
  type StopResponse,
} from '../shared/protocol'
import { asClientErrorCode, type ClientErrorCode } from './i18n'

/** A normalized API failure the UI can localize. */
export class ApiClientError extends Error {
  readonly code: ClientErrorCode
  readonly status: number
  readonly detail: string | undefined

  /**
   * @param code - localized failure code.
   * @param status - HTTP status (0 for transport failures).
   * @param detail - optional server detail.
   */
  constructor(code: ClientErrorCode, status: number, detail?: string) {
    super(code)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/** The four plugin operations. */
export interface ProfileApi {
  list(signal?: AbortSignal): Promise<ListResponse>
  open(home: string, name: string, signal?: AbortSignal): Promise<StatusResponse>
  status(home: string, name: string, signal?: AbortSignal): Promise<StatusResponse>
  stop(home: string, name: string, signal?: AbortSignal): Promise<StopResponse>
}

/** @param value - unknown JSON value. @returns whether it is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Detect an aborted request without depending on a specific DOMException realm.
 * @param error - thrown value.
 * @returns whether it represents cancellation.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Wait, unless the signal aborts first.
 * @param ms - delay in milliseconds.
 * @param signal - cancellation signal.
 * @returns a promise settled after the delay.
 */
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('aborted'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** @param status - HTTP status. @param code - error code carried in the body. */
function mapStatus(status: number, code: string | undefined): ClientErrorCode {
  if (code !== undefined) {
    const mapped = asClientErrorCode(code)
    if (mapped !== 'request-failed') return mapped
  }
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'unsupported-host'
  if (status === 413) return 'payload-too-large'
  if (status === 429) return 'too-many-profiles'
  if (status >= 500) return 'internal-error'
  return 'request-failed'
}

/**
 * Create the typed Client for the plugin routes.
 *
 * @param fetchImpl - fetch implementation (injectable for tests).
 * @returns the API facade.
 */
export function createApi(fetchImpl?: typeof fetch): ProfileApi {
  // Resolve the global lazily so creating the API never throws in a non-browser
  // context (tests, SSR probes) and so a polyfilled fetch installed after plugin
  // activation is still honored.
  const doFetch: typeof fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init))

  /** @param path - route suffix. @param init - fetch init. @param signal - cancellation. */
  async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${API_PREFIX}${path}`, {
        ...init,
        ...(signal === undefined ? {} : { signal }),
        credentials: 'same-origin',
        cache: 'no-store',
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      const detail = error instanceof Error ? error.message : String(error)
      throw new ApiClientError('request-failed', 0, detail)
    }

    const text = await response.text()
    let payload: unknown = null
    if (text.trim() !== '') {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }

    if (!response.ok) {
      const code =
        isRecord(payload) && typeof payload.error === 'string' ? payload.error : undefined
      const detail =
        isRecord(payload) && typeof payload.detail === 'string' ? payload.detail : undefined
      throw new ApiClientError(
        mapStatus(response.status, code),
        response.status,
        detail ?? (isRecord(payload) ? undefined : text.slice(0, 200)),
      )
    }
    if (!isRecord(payload)) throw new ApiClientError('request-failed', response.status)
    return payload as T
  }

  /** @param home - home path. @param name - profile name. @param signal - cancellation. */
  function post(path: string, home: string, name: string, signal?: AbortSignal): Promise<unknown> {
    return request<unknown>(
      path,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ home, name }),
      },
      signal,
    )
  }

  return {
    async list(signal) {
      return request<ListResponse>('/list', { method: 'GET' }, signal)
    },
    async open(home, name, signal) {
      return (await post('/open', home, name, signal)) as StatusResponse
    },
    async status(home, name, signal) {
      const query = `?home=${encodeURIComponent(home)}&name=${encodeURIComponent(name)}`
      return request<StatusResponse>(`/status${query}`, { method: 'GET' }, signal)
    },
    async stop(home, name, signal) {
      return (await post('/stop', home, name, signal)) as StopResponse
    },
  }
}

/** Narrow an unknown value to an error response body (used by tests). */
export function isErrorResponse(value: unknown): value is ErrorResponse {
  return isRecord(value) && typeof value.error === 'string'
}
