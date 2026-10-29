import { stripAnsi } from './redact'

/** The line `dsh web` prints after the target server is listening. */
const LINE_MARKER = 'dsh web: '

/** Retain enough of a partial chunk to finish a line; bound memory on a chatty child. */
const MAX_BUFFER = 64 * 1024

/**
 * Parse one line of child output for the launch URL.
 *
 * The line is `dsh web: <url>` when `printUrl` is enabled (the default). Other
 * `dsh web:` lines, such as the "opening the default browser" notice, are rejected
 * because the candidate must be a single valid HTTP(S) URL without credentials.
 *
 * @param line - one complete output line.
 * @returns the validated URL, or null.
 */
export function parseWebUrlLine(line: string): string | null {
  const markerIndex = line.indexOf(LINE_MARKER)
  if (markerIndex < 0) return null
  const candidate = line.slice(markerIndex + LINE_MARKER.length).trim()
  if (candidate === '' || /\s/u.test(candidate)) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username !== '' || url.password !== '') return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Incremental line scanner for child stdout.
 *
 * Handles ANSI escapes and URLs split across chunks. Once a URL is found the caller
 * clears the scanner; further pushes are ignored.
 */
export class WebUrlScanner {
  private buffer = ''
  private found: string | null = null

  /** @param chunk - decoded stdout chunk. @returns the URL once it appears. */
  push(chunk: string): string | null {
    if (this.found !== null) return this.found
    this.buffer = (this.buffer + stripAnsi(chunk)).slice(-MAX_BUFFER)

    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return null
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      const url = parseWebUrlLine(line)
      if (url !== null) {
        this.found = url
        this.buffer = ''
        return url
      }
    }
  }
}
