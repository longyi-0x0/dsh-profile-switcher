import { describe, expect, it } from 'vitest'
import { loggableOrigin, redactSecrets, sanitizeDetail, stripAnsi } from '../../src/host/redact'

describe('stripAnsi', () => {
  it('removes colour sequences', () => {
    expect(stripAnsi('\u001b[31mred\u001b[0m plain')).toBe('red plain')
  })
})

describe('redactSecrets', () => {
  it('redacts token query values', () => {
    const text = 'http://127.0.0.1:3000/?token=s3cret&x=1'
    expect(redactSecrets(text)).toBe('http://127.0.0.1:3000')
  })

  it('redacts other credential-shaped query keys', () => {
    expect(redactSecrets('/?api_key=abc&access_token=def')).toBe(
      '/?api_key=<redacted>&access_token=<redacted>',
    )
  })

  it('replaces full URLs with their origin', () => {
    expect(redactSecrets('please open http://127.0.0.1:9/path?q=1 now')).toBe(
      'please open http://127.0.0.1:9 now',
    )
  })
})

describe('sanitizeDetail', () => {
  it('strips escapes and control characters and collapses whitespace', () => {
    expect(sanitizeDetail('\u001b[31mfailed\u0000\n  badly\u001b[0m')).toBe('failed badly')
  })

  it('truncates long details with an ellipsis', () => {
    const detail = sanitizeDetail('x'.repeat(100), 10)
    expect(detail).toHaveLength(10)
    expect(detail.endsWith('…')).toBe(true)
  })

  it('never keeps a token', () => {
    expect(sanitizeDetail('GET http://127.0.0.1:1/?token=secret failed')).not.toContain('secret')
  })
})

describe('loggableOrigin', () => {
  it('returns the origin only', () => {
    expect(loggableOrigin('http://127.0.0.1:4321/?token=secret')).toBe('http://127.0.0.1:4321')
  })

  it('returns null for invalid input', () => {
    expect(loggableOrigin('nope')).toBeNull()
  })
})
