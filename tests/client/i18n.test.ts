import { describe, expect, it } from 'vitest'
import {
  asClientErrorCode,
  diagnosticMessage,
  en,
  errorMessage,
  message,
  zh,
  type ClientErrorCode,
} from '../../src/client/i18n'

/** Placeholders in a template: `{name}`. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z]+)\}/gu)].map((match) => match[1] ?? '').sort()
}

describe('dictionaries', () => {
  it('cover exactly the same keys', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('use the same placeholders in every language', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(zh[key])).toEqual(placeholders(en[key]))
    }
  })
})

describe('message', () => {
  it('uses the injected translator', () => {
    expect(message((key) => `T:${key}`, 'menu.title')).toBe('T:menu.title')
  })

  it('falls back to the bundled English text when the translator misses', () => {
    expect(message(() => 'menu.title', 'menu.title')).toBe(en['menu.title'])
    expect(message(undefined, 'menu.title')).toBe(en['menu.title'])
  })

  it('interpolates parameters', () => {
    expect(message(undefined, 'embed.starting', { name: 'trading' })).toContain('trading')
    expect(message(undefined, 'embed.starting', { name: 'trading' })).not.toContain('{name}')
  })

  it('survives a throwing translator', () => {
    expect(
      message(() => {
        throw new Error('boom')
      }, 'menu.title'),
    ).toBe(en['menu.title'])
  })
})

describe('errorMessage', () => {
  const codes: ClientErrorCode[] = [
    'invalid-json',
    'invalid-body',
    'payload-too-large',
    'unknown-home',
    'invalid-profile-name',
    'profile-not-found',
    'profile-is-current',
    'too-many-profiles',
    'launcher-unavailable',
    'internal-error',
    'spawn-failed',
    'start-timeout',
    'exited',
    'stopped',
    'request-failed',
    'unsupported-host',
    'unauthorized',
    'embed-failed',
    'embed-timeout',
    'guest-gone',
    'server-stopped',
    'popup-blocked',
  ]

  it('localizes every known code', () => {
    for (const code of codes) {
      expect(errorMessage(undefined, code)).not.toBe('')
    }
  })

  it('maps host codes through asClientErrorCode', () => {
    expect(asClientErrorCode('profile-not-found')).toBe('profile-not-found')
    expect(asClientErrorCode('made-up')).toBe('request-failed')
    expect(asClientErrorCode(undefined)).toBe('request-failed')
  })
})

describe('diagnosticMessage', () => {
  it('localizes known diagnostics', () => {
    expect(diagnosticMessage(undefined, 'launcher-missing')).toContain('launcher')
  })

  it('ignores unknown diagnostics', () => {
    expect(diagnosticMessage(undefined, 'who-knows')).toBeNull()
  })
})
