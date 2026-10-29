/** URLs that may contain a launch token. */
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi
/** Credential-shaped query values in non-URL text. */
const TOKEN_PATTERN = /([?&](?:token|api[_-]?key|access[_-]?token|key)=)[^&\s"'<>]+/gi
/** Default maximum detail length shown in the UI. */
const MAX_DETAIL = 300

/**
 * Make an error detail safe to render.
 *
 * The Host already redacts, but a guest `loadURL` rejection can echo the target URL,
 * which carries the launch token. Every detail crossing into the Client store goes
 * through this function.
 *
 * @param value - raw detail.
 * @param limit - maximum characters.
 * @returns sanitized detail, or undefined when nothing remains.
 */
export function sanitizeDetail(value: string | undefined, limit = MAX_DETAIL): string | undefined {
  if (value === undefined) return undefined
  const cleaned = value
    .replace(URL_PATTERN, (match) => {
      try {
        return new URL(match).origin
      } catch {
        return '<url>'
      }
    })
    .replace(TOKEN_PATTERN, '$1<redacted>')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned === '') return undefined
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, Math.max(0, limit - 1))}…`
}
