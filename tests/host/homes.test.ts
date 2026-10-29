import { dirname, join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverHomes, homeLabel, type DirectoryEntry } from '../../src/host/homes'

const HOME = resolve('/Users/tester')
const CURRENT = join(HOME, '.dsh')
const EXTRA_A = join(resolve('/srv'), '.dsh-a')
const EXTRA_B = join(resolve('/srv'), '.dsh-b')

function entry(name: string, directory = true): DirectoryEntry {
  return { name, isDirectory: () => directory }
}

function deps(options: {
  currentHome?: string
  additionalHomes?: string[]
  discoverSiblingHomes?: boolean
  homes?: string[]
  siblings?: DirectoryEntry[]
}) {
  const homesWithProfiles = new Set(options.homes ?? [CURRENT])
  return {
    homeDir: HOME,
    currentHome: options.currentHome ?? CURRENT,
    ...(options.additionalHomes === undefined ? {} : { additionalHomes: options.additionalHomes }),
    ...(options.discoverSiblingHomes === undefined
      ? {}
      : { discoverSiblingHomes: options.discoverSiblingHomes }),
    exists: (path: string) => homesWithProfiles.has(dirname(path)),
    readdir: () => options.siblings ?? [],
  }
}

describe('discoverHomes', () => {
  it('includes the current home only when it owns a profiles directory', () => {
    expect(discoverHomes(deps({ homes: [] }))).toEqual([])
    expect(discoverHomes(deps({}))).toEqual([CURRENT])
  })

  it('adds siblings that own a profiles directory and skips everything else', () => {
    const result = discoverHomes(
      deps({
        homes: [CURRENT, join(HOME, '.dsh-trading'), join(HOME, '.dsh_lab')],
        siblings: [
          entry('.dsh-trading'),
          entry('.dsh_lab'),
          entry('.dsh-cache'), // no profiles/
          entry('docs'),
          entry('.dsh-file', false),
        ],
      }),
    )
    expect(result).toEqual([CURRENT, join(HOME, '.dsh-trading'), join(HOME, '.dsh_lab')])
  })

  it('deduplicates a sibling that is also the current home', () => {
    expect(discoverHomes(deps({ siblings: [entry('.dsh')] }))).toEqual([CURRENT])
  })

  it('accepts additional homes and deduplicates them', () => {
    const result = discoverHomes(
      deps({
        additionalHomes: [EXTRA_A, EXTRA_B, EXTRA_A],
        homes: [CURRENT, EXTRA_A, EXTRA_B],
        discoverSiblingHomes: false,
      }),
    )
    expect(result).toEqual([CURRENT, EXTRA_A, EXTRA_B])
  })

  it('can disable sibling discovery', () => {
    const other = join(HOME, '.dsh-other')
    const result = discoverHomes(
      deps({
        homes: [CURRENT, other],
        siblings: [entry('.dsh-other')],
        discoverSiblingHomes: false,
      }),
    )
    expect(result).toEqual([CURRENT])
  })

  it('survives an unreadable home directory', () => {
    const base = deps({})
    const result = discoverHomes({
      ...base,
      readdir: () => {
        throw new Error('EACCES')
      },
    })
    expect(result).toEqual([CURRENT])
  })
})

describe('homeLabel', () => {
  it('shortens paths under the home directory', () => {
    expect(homeLabel(CURRENT, HOME)).toBe(`~${sep}.dsh`)
    expect(homeLabel(join(HOME, '.dsh-trading'), HOME)).toBe(`~${sep}.dsh-trading`)
  })

  it('returns the home directory as ~', () => {
    expect(homeLabel(HOME, HOME)).toBe('~')
  })

  it('keeps paths outside the home directory absolute', () => {
    expect(homeLabel(EXTRA_A, HOME)).toBe(EXTRA_A)
  })
})
