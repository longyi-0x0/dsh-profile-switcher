import { describe, expect, it } from 'vitest'
import { discoverHomes, homeLabel, type DirectoryEntry } from '../../src/host/homes'

const HOME = '/Users/tester'

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
  const homesWithProfiles = new Set(options.homes ?? [`${HOME}/.dsh`])
  return {
    homeDir: HOME,
    currentHome: options.currentHome ?? `${HOME}/.dsh`,
    ...(options.additionalHomes === undefined ? {} : { additionalHomes: options.additionalHomes }),
    ...(options.discoverSiblingHomes === undefined
      ? {}
      : { discoverSiblingHomes: options.discoverSiblingHomes }),
    exists: (path: string) => homesWithProfiles.has(path.replace(/\/profiles$/u, '')),
    readdir: () => options.siblings ?? [],
  }
}

describe('discoverHomes', () => {
  it('includes the current home only when it owns a profiles directory', () => {
    expect(discoverHomes(deps({ homes: [] }))).toEqual([])
    expect(discoverHomes(deps({}))).toEqual([`${HOME}/.dsh`])
  })

  it('adds siblings that own a profiles directory and skips everything else', () => {
    const result = discoverHomes(
      deps({
        homes: [`${HOME}/.dsh`, `${HOME}/.dsh-trading`, `${HOME}/.dsh_lab`],
        siblings: [
          entry('.dsh-trading'),
          entry('.dsh_lab'),
          entry('.dsh-cache'), // no profiles/
          entry('docs'),
          entry('.dsh-file', false),
        ],
      }),
    )
    expect(result).toEqual([`${HOME}/.dsh`, `${HOME}/.dsh-trading`, `${HOME}/.dsh_lab`])
  })

  it('deduplicates a sibling that is also the current home', () => {
    const result = discoverHomes(deps({ homes: [`${HOME}/.dsh`], siblings: [entry('.dsh')] }))
    expect(result).toEqual([`${HOME}/.dsh`])
  })

  it('accepts additional homes and deduplicates them', () => {
    const result = discoverHomes(
      deps({
        additionalHomes: ['/srv/.dsh-a', '/srv/.dsh-b', '/srv/.dsh-a'],
        homes: [`${HOME}/.dsh`, '/srv/.dsh-a', '/srv/.dsh-b'],
        discoverSiblingHomes: false,
      }),
    )
    expect(result).toEqual([`${HOME}/.dsh`, '/srv/.dsh-a', '/srv/.dsh-b'])
  })

  it('can disable sibling discovery', () => {
    const result = discoverHomes(
      deps({
        homes: [`${HOME}/.dsh`, `${HOME}/.dsh-other`],
        siblings: [entry('.dsh-other')],
        discoverSiblingHomes: false,
      }),
    )
    expect(result).toEqual([`${HOME}/.dsh`])
  })

  it('survives an unreadable home directory', () => {
    const base = deps({})
    const result = discoverHomes({
      ...base,
      readdir: () => {
        throw new Error('EACCES')
      },
    })
    expect(result).toEqual([`${HOME}/.dsh`])
  })
})

describe('homeLabel', () => {
  it('shortens paths under the home directory', () => {
    expect(homeLabel(`${HOME}/.dsh`, HOME)).toBe('~/.dsh')
    expect(homeLabel(`${HOME}/.dsh-trading`, HOME)).toBe('~/.dsh-trading')
  })

  it('returns the home directory as ~', () => {
    expect(homeLabel(HOME, HOME)).toBe('~')
  })

  it('keeps paths outside the home directory absolute', () => {
    expect(homeLabel('/srv/.dsh', HOME)).toBe('/srv/.dsh')
  })
})
