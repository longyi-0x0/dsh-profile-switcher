import { describe, expect, it, vi } from 'vitest'
import {
  WINDOW_SHELL_NAME,
  launchWindowShell,
  resolveWindowShell,
  type ShellChild,
  type ShellSpawn,
} from '../../src/host/window-shell'

const PACKAGE_ROOT = '/Users/tester/dsh-profile-switcher'

/** @param options - which paths exist and which are executable. */
function deps(options: {
  configured?: string | null
  path?: string
  exists?: string[]
  executable?: string[]
  platform?: NodeJS.Platform
}) {
  const exists = new Set(options.exists ?? [])
  const executable = new Set(options.executable ?? [])
  return {
    configured: options.configured ?? null,
    env: { PATH: options.path ?? '' },
    platform: options.platform ?? ('darwin' as NodeJS.Platform),
    exists: (path: string) => exists.has(path),
    isExecutable: (path: string) => executable.has(path),
    packageRoot: PACKAGE_ROOT,
  }
}

describe('resolveWindowShell', () => {
  it('uses the configured program first', () => {
    const configured = '/opt/bin/my-window'
    expect(
      resolveWindowShell(deps({ configured, executable: [configured], exists: [configured] })),
    ).toBe(configured)
  })

  it('ignores a configured program that is not executable', () => {
    const configured = '/opt/bin/my-window'
    expect(resolveWindowShell(deps({ configured, path: '/usr/bin', exists: [configured] }))).toBe(
      null,
    )
  })

  it('falls back to PATH and then to the checkout build', () => {
    const onPath = '/usr/local/bin/dsh-profile-window'
    expect(resolveWindowShell(deps({ path: '/usr/local/bin', executable: [onPath] }))).toBe(onPath)

    const built = `${PACKAGE_ROOT}/native-window/target/release/${WINDOW_SHELL_NAME}`
    expect(resolveWindowShell(deps({ executable: [built] }))).toBe(built)
    expect(resolveWindowShell(deps({}))).toBeNull()
  })

  it('appends the Windows executable extension', () => {
    const built = `${PACKAGE_ROOT}/native-window/target/release/${WINDOW_SHELL_NAME}.exe`
    expect(resolveWindowShell(deps({ platform: 'win32', executable: [built] }))).toBe(built)
  })
})

describe('launchWindowShell', () => {
  /** @param fail - whether the child reports a spawn error. @returns the fake spawn seam. */
  function fakeSpawn(fail = false) {
    const calls: { command: string; args: string[] }[] = []
    const writes: string[] = []
    const unref = vi.fn()
    const spawn: ShellSpawn = (command, args) => {
      calls.push({ command, args })
      const child = {
        stdin: { end: (chunk: string) => writes.push(chunk) },
        unref,
        on(event: 'error' | 'spawn', listener: (error: Error) => void) {
          if (event === 'error' && fail) listener(new Error('ENOENT'))
          if (event === 'spawn' && !fail) listener(new Error())
          return child
        },
      } as unknown as ShellChild
      return child
    }
    return { spawn, calls, writes, unref }
  }

  it('passes the title in argv and the URL on stdin', async () => {
    const fake = fakeSpawn()
    await launchWindowShell(fake.spawn, {
      command: '/opt/bin/dsh-profile-window',
      url: 'http://127.0.0.1:4321/?token=secret',
      title: 'web — DeepSeek Harness',
    })
    expect(fake.calls).toEqual([
      {
        command: '/opt/bin/dsh-profile-window',
        args: ['--title', 'web — DeepSeek Harness'],
      },
    ])
    expect(fake.writes).toEqual(['http://127.0.0.1:4321/?token=secret'])
    // The token must never be visible in the command line.
    expect(JSON.stringify(fake.calls)).not.toContain('token=')
    expect(fake.unref).toHaveBeenCalled()
  })

  it('rejects when the host cannot start', async () => {
    const fake = fakeSpawn(true)
    await expect(
      launchWindowShell(fake.spawn, { command: '/opt/bin/x', url: 'http://x/', title: 'x' }),
    ).rejects.toThrow('ENOENT')
  })

  it('rejects a synchronous spawn throw', async () => {
    const spawn: ShellSpawn = () => {
      throw new Error('blocked')
    }
    await expect(
      launchWindowShell(spawn, { command: '/opt/bin/x', url: 'http://x/', title: 'x' }),
    ).rejects.toThrow('blocked')
  })
})
