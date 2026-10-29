/**
 * Redaction helpers for logs and error details.
 *
 * A target profile's launch URL carries a bearer token that grants full access to
 * that profile's API. It must never be logged, returned by `/list`, or embedded in an
 * error message. Child stdout/stderr is untrusted text: it may contain ANSI escapes,
 * control characters, or a copied URL, so everything leaving the Host goes through
 * `sanitizeDetail`.
 */

// eslint-disable-next-line no-control-regex -- ANSI escape sequences are control characters.
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const TOKEN_QUERY_PATTERN = /([?&](?:token|api[_-]?key|access[_-]?token|key)=)[^&\s"'<>]+/gi
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi
// eslint-disable-next-line no-control-regex -- child output is scrubbed of control characters.
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** @param text - raw child output. @returns text without ANSI escape sequences. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

/**
 * Remove credential-shaped query values and replace any full URL with its origin.
 * @param text - arbitrary text.
 * @returns text safe to log or return.
 */
export function redactSecrets(text: string): string {
  // Replace full URLs first: their query string may carry the launch token, and the
  // origin alone is all a log needs. Token-shaped query values in non-URL text are
  // redacted afterwards.
  const withoutUrls = text.replace(URL_PATTERN, (value) => loggableOrigin(value) ?? '<url>')
  return withoutUrls.replace(TOKEN_QUERY_PATTERN, '$1<redacted>')
}

/**
 * Collapse one piece of child output into a bounded, credential-free error detail.
 * @param text - raw text.
 * @param limit - maximum characters.
 * @returns sanitized detail.
 */
export function sanitizeDetail(text: string, limit = 400): string {
  const cleaned = redactSecrets(stripAnsi(text))
    .replace(CONTROL_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= limit) return cleaned
  return `${cleaned.slice(0, Math.max(0, limit - 1))}…`
}

/**
 * Return only the origin (`scheme://host:port`) of a URL for logging.
 * @param value - URL string.
 * @returns the origin, or null when the value is not a valid URL.
 */
export function loggableOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}
