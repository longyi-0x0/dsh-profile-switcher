import { describe, expect, it } from 'vitest'
import { sanitizeDetail } from '../../src/client/redact'

describe('sanitizeDetail', () => {
  it('returns undefined for missing or blank details', () => {
    expect(sanitizeDetail(undefined)).toBeUndefined()
    expect(sanitizeDetail('   ')).toBeUndefined()
  })

  it('replaces a URL with its origin', () => {
    expect(sanitizeDetail('failed at http://127.0.0.1:4321/path?q=1')).toBe(
      'failed at http://127.0.0.1:4321',
    )
  })

  it('removes the launch token', () => {
    const detail = sanitizeDetail('GET http://127.0.0.1:4321/?token=secret failed')
    expect(detail).not.toContain('secret')
    expect(detail).toContain('http://127.0.0.1:4321')
  })

  it('redacts token-shaped query values outside a URL', () => {
    expect(sanitizeDetail('/?api_key=abc&access_token=def')).toBe(
      '/?api_key=<redacted>&access_token=<redacted>',
    )
  })

  it('collapses whitespace and truncates', () => {
    const detail = sanitizeDetail('a\n\n  b   c', 4)
    expect(detail).toBe('a b…')
  })
})
