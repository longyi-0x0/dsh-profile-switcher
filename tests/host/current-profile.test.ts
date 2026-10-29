import { describe, expect, it } from 'vitest'
import { detectCurrentProfile } from '../../src/host/current-profile'

const PROFILES_DIR = '/Users/tester/.dsh/profiles'

function detect(env: Record<string, string | undefined>, argv: readonly string[]) {
  return detectCurrentProfile({ env, argv, profilesDir: PROFILES_DIR })
}

describe('detectCurrentProfile', () => {
  it('prefers DSH_PROFILE', () => {
    expect(detect({ DSH_PROFILE: 'trading' }, ['node', 'dsh', '--profile', 'other'])).toBe(
      'trading',
    )
  })

  it('trims DSH_PROFILE and rejects invalid names', () => {
    expect(detect({ DSH_PROFILE: '  desktop  ' }, [])).toBe('desktop')
    expect(detect({ DSH_PROFILE: '--bad' }, [])).toBeNull()
  })

  it('falls back to the DSH_PROFILE_DIR basename', () => {
    expect(detect({ DSH_PROFILE_DIR: '/Users/tester/.dsh/profiles/web/' }, [])).toBe('web')
  })

  it('falls back to a --profile argument', () => {
    expect(detect({}, ['node', 'dsh', '--profile', 'work', '--no-open'])).toBe('work')
  })

  it('falls back to argv[3] when it names a directory under profiles', () => {
    expect(detect({}, ['node', 'cli.js', 'x', `${PROFILES_DIR}/desktop`])).toBe('desktop')
  })

  it('ignores argv[3] outside profiles', () => {
    expect(detect({}, ['node', 'cli.js', 'x', '/tmp/desktop'])).toBeNull()
  })

  it('returns null when nothing identifies the profile', () => {
    expect(detect({}, ['node', 'cli.js'])).toBeNull()
  })
})
