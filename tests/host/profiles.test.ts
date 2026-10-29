import { describe, expect, it } from 'vitest'
import { listProfileDirectories, type ProfileDirectoryEntry } from '../../src/host/profiles'

const PROFILES = '/Users/tester/.dsh/profiles'

function entry(name: string, directory = true): ProfileDirectoryEntry {
  return { name, isDirectory: () => directory }
}

function deps(options: {
  entries?: ProfileDirectoryEntry[]
  manifests?: Record<string, string>
  mtimes?: Record<string, number>
}) {
  const manifests = options.manifests ?? {}
  return {
    readdir: () => options.entries ?? [],
    exists: (path: string) => path in manifests,
    readFile: (path: string) => {
      const value = manifests[path]
      if (value === undefined) throw new Error(`missing ${path}`)
      return value
    },
    mtime: (path: string) => options.mtimes?.[path],
  }
}

describe('listProfileDirectories', () => {
  it('lists directories that own a package.json, sorted by name', () => {
    const manifests = {
      [`${PROFILES}/web/package.json`]: JSON.stringify({
        dsh: { profile: { bundles: ['a', 'b'] } },
      }),
      [`${PROFILES}/desktop/package.json`]: JSON.stringify({
        dsh: { profile: { bundles: ['a'] } },
      }),
    }
    const result = listProfileDirectories(
      PROFILES,
      deps({
        entries: [entry('web'), entry('desktop'), entry('docs', false), entry('.hidden')],
        manifests,
      }),
    )
    expect(result).toEqual([
      { name: 'desktop', bundles: 1 },
      { name: 'web', bundles: 2 },
    ])
  })

  it('keeps a malformed manifest as a profile with zero bundles', () => {
    const path = `${PROFILES}/web/package.json`
    const result = listProfileDirectories(
      PROFILES,
      deps({ entries: [entry('web')], manifests: { [path]: '{not json' } }),
    )
    expect(result).toEqual([{ name: 'web', bundles: 0 }])
  })

  it('skips a directory without a manifest and names that cannot be launched', () => {
    const result = listProfileDirectories(
      PROFILES,
      deps({
        entries: [entry('web'), entry('no manifest'), entry('-bad'), entry('has space')],
        manifests: { [`${PROFILES}/web/package.json`]: '{}' },
      }),
    )
    expect(result).toEqual([{ name: 'web', bundles: 0 }])
  })

  it('includes the manifest mtime when available', () => {
    const path = `${PROFILES}/web/package.json`
    const result = listProfileDirectories(
      PROFILES,
      deps({
        entries: [entry('web')],
        manifests: { [path]: '{}' },
        mtimes: { [path]: 1234 },
      }),
    )
    expect(result).toEqual([{ name: 'web', bundles: 0, updatedAt: 1234 }])
  })

  it('returns an empty list when the profiles directory is unreadable', () => {
    const result = listProfileDirectories(PROFILES, {
      readdir: () => {
        throw new Error('ENOENT')
      },
      exists: () => false,
      readFile: () => '',
      mtime: () => undefined,
    })
    expect(result).toEqual([])
  })

  it('counts bundles only when the manifest declares an array', () => {
    const path = `${PROFILES}/web/package.json`
    const result = listProfileDirectories(
      PROFILES,
      deps({
        entries: [entry('web')],
        manifests: { [path]: JSON.stringify({ dsh: { profile: { bundles: 'nope' } } }) },
      }),
    )
    expect(result).toEqual([{ name: 'web', bundles: 0 }])
  })
})
