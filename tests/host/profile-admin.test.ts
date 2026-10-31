import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/host/errors'
import {
  canDeleteProfile,
  createProfile,
  deleteProfile,
  isReservedProfile,
  newProfileManifest,
  profileDirectory,
  type ProfileAdminDeps,
} from '../../src/host/profile-admin'

const HOME = '/Users/tester/.dsh'

interface FakeOptions {
  /** Directories that already exist. */
  existing?: string[]
  /** Fail the first file write. */
  failWrite?: boolean
  /** Fail the directory removal. */
  failRemove?: boolean
  /** Fail the directory creation. */
  failMkdir?: boolean
}

function fakeAdmin(options: FakeOptions = {}) {
  const directories = new Set(options.existing ?? [])
  const files = new Map<string, string>()
  const writes: string[] = []
  const removed: string[] = []
  const admin: ProfileAdminDeps = {
    exists: (path) => directories.has(path),
    mkdir: (path) => {
      if (options.failMkdir === true) throw new Error('ENOSPC: no space left on device')
      if (directories.has(path)) throw new Error('EEXIST: file already exists')
      directories.add(path)
    },
    writeFile: (path, content) => {
      if (options.failWrite === true) throw new Error('EACCES: permission denied')
      writes.push(path)
      files.set(path, content)
    },
    remove: (path) => {
      if (options.failRemove === true) throw new Error('EBUSY: resource busy')
      removed.push(path)
      directories.delete(path)
    },
  }
  return { admin, directories, files, writes, removed }
}

/** @param run - operation expected to fail. @returns the ApiError code, if any. */
function errorCode(run: () => void): string | undefined {
  try {
    run()
  } catch (error) {
    return error instanceof ApiError ? error.code : undefined
  }
  return undefined
}

describe('newProfileManifest', () => {
  it('declares the Web bundle stack and no dependencies', () => {
    const manifest = JSON.parse(newProfileManifest('lab'))
    expect(manifest).toEqual({
      name: 'dsh-profile-lab',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
  })

  it('ends with a newline for hand editing', () => {
    expect(newProfileManifest('lab').endsWith('}\n')).toBe(true)
  })
})

describe('createProfile', () => {
  it('writes the patch layer, the workspace settings, and the manifest last', () => {
    const fake = fakeAdmin()
    createProfile(HOME, 'lab', fake.admin)
    const directory = join(HOME, 'profiles', 'lab')
    expect(fake.writes).toEqual([
      join(directory, 'cordis.patch.yml'),
      join(directory, 'pnpm-workspace.yaml'),
      join(directory, 'package.json'),
    ])
    expect(fake.files.get(join(directory, 'cordis.patch.yml'))).toContain('[]')
    expect(fake.files.get(join(directory, 'pnpm-workspace.yaml'))).toContain('nodeLinker: hoisted')
    expect(fake.files.get(join(directory, 'package.json'))).toBe(newProfileManifest('lab'))
  })

  it('refuses a directory that already exists', () => {
    const existing = join(HOME, 'profiles', 'lab')
    const fake = fakeAdmin({ existing: [existing] })
    expect(errorCode(() => createProfile(HOME, 'lab', fake.admin))).toBe('profile-exists')
    expect(fake.writes).toEqual([])
  })

  it('maps a lost race on mkdir to profile-exists', () => {
    const fake = fakeAdmin({ failMkdir: true })
    expect(errorCode(() => createProfile(HOME, 'lab', fake.admin))).toBe('profile-exists')
  })

  it('removes the half-written directory when a file cannot be written', () => {
    const fake = fakeAdmin({ failWrite: true })
    expect(errorCode(() => createProfile(HOME, 'lab', fake.admin))).toBe('profile-create-failed')
    expect(fake.removed).toEqual([join(HOME, 'profiles', 'lab')])
  })

  it('resolves the directory below the profiles root', () => {
    expect(profileDirectory(HOME, 'lab')).toBe(join(HOME, 'profiles', 'lab'))
  })
})

describe('deleteProfile', () => {
  it('removes the profile directory', () => {
    const directory = join(HOME, 'profiles', 'lab')
    const fake = fakeAdmin({ existing: [directory] })
    deleteProfile(HOME, 'lab', fake.admin)
    expect(fake.removed).toEqual([directory])
  })

  it('reports a missing profile and a failed removal', () => {
    const missing = fakeAdmin()
    expect(errorCode(() => deleteProfile(HOME, 'lab', missing.admin))).toBe('profile-not-found')
    expect(missing.removed).toEqual([])

    const directory = join(HOME, 'profiles', 'lab')
    const failing = fakeAdmin({ existing: [directory], failRemove: true })
    expect(errorCode(() => deleteProfile(HOME, 'lab', failing.admin))).toBe('profile-delete-failed')
  })
})

describe('profile policy', () => {
  it('keeps the app-managed profile reserved in the served home only', () => {
    expect(isReservedProfile(HOME, 'desktop', HOME)).toBe(true)
    expect(isReservedProfile('/Users/tester/.dsh-trading', 'desktop', HOME)).toBe(false)
  })

  it('never deletes the running or app-managed profile', () => {
    expect(canDeleteProfile(HOME, 'desktop', HOME, 'desktop')).toBe(false)
    expect(canDeleteProfile(HOME, 'desktop', HOME, 'web')).toBe(false)
    expect(canDeleteProfile(HOME, 'web', HOME, 'web')).toBe(false)
    expect(canDeleteProfile('/Users/tester/.dsh-trading', 'desktop', HOME, 'desktop')).toBe(true)
    expect(canDeleteProfile(HOME, 'lab', HOME, 'desktop')).toBe(true)
  })
})
