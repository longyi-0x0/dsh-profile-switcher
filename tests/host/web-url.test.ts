import { describe, expect, it } from 'vitest'
import { parseWebUrlLine, WebUrlScanner } from '../../src/host/web-url'

describe('parseWebUrlLine', () => {
  it('extracts the launch URL', () => {
    expect(parseWebUrlLine('dsh web: http://127.0.0.1:4321/?token=abc')).toBe(
      'http://127.0.0.1:4321/?token=abc',
    )
  })

  it('tolerates a prefix and surrounding whitespace', () => {
    expect(parseWebUrlLine('  info dsh web:   https://localhost:9000/  ')).toBe(
      'https://localhost:9000/',
    )
  })

  it('ignores the browser-opened notice', () => {
    expect(
      parseWebUrlLine('dsh web: opening the default browser; pass --no-open to disable'),
    ).toBeNull()
  })

  it('rejects non-HTTP schemes and credentials', () => {
    expect(parseWebUrlLine('dsh web: file:///etc/passwd')).toBeNull()
    expect(parseWebUrlLine('dsh web: http://user:pass@127.0.0.1:1/')).toBeNull()
    expect(parseWebUrlLine('dsh web: not-a-url')).toBeNull()
  })

  it('ignores unrelated lines', () => {
    expect(parseWebUrlLine('ready in 120ms')).toBeNull()
    expect(parseWebUrlLine('')).toBeNull()
  })
})

describe('WebUrlScanner', () => {
  it('handles a URL split across chunks', () => {
    const scanner = new WebUrlScanner()
    expect(scanner.push('starting\ndsh web: http://127.0.0.1:4')).toBeNull()
    expect(scanner.push('321/?token=secret\nmore output\n')).toBe(
      'http://127.0.0.1:4321/?token=secret',
    )
    expect(scanner.push('anything')).toBe('http://127.0.0.1:4321/?token=secret')
  })

  it('strips ANSI escapes', () => {
    const scanner = new WebUrlScanner()
    expect(scanner.push('\u001b[32mdsh web: http://127.0.0.1:1/\u001b[0m\n')).toBe(
      'http://127.0.0.1:1/',
    )
  })

  it('waits until a full line arrives', () => {
    const scanner = new WebUrlScanner()
    expect(scanner.push('dsh web: http://127.0.0.1:1')).toBeNull()
    expect(scanner.push('/\n')).toBe('http://127.0.0.1:1/')
  })
})
