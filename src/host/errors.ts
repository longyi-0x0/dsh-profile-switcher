import type { ApiErrorCode } from '../shared/protocol'

/**
 * An error that maps to an HTTP response without leaking internals.
 *
 * `code` is stable and localizable by the Client; `detail` is optional human detail
 * that is redacted before it leaves the Host. Internal failures are logged with the
 * original error and reported as `internal-error` without detail.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly detail: string | undefined

  /**
   * @param code - stable wire code.
   * @param status - HTTP status to return.
   * @param detail - optional redacted detail.
   */
  constructor(code: ApiErrorCode, status: number, detail?: string) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/** @param error - unknown thrown value. @returns whether it is an ApiError. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
