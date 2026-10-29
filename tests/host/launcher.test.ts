import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  childEnv,
  launcherArgs,
  resolveLauncher,
  type LauncherDeps,
  type ResolvedLauncher,
} from '../../src/host/launcher'

const CLI =
  '/Applications/DSH.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'

function deps(overrides: Partial<LauncherDeps> = {}): LauncherDeps {
  return {
    env: {},
    platform: 'darwin',
    execPath: '/Applications/DSH.app/Contents/MacOS/DSH',
    argv: ['node', 'host.js'],
    resourcesPath: '/Applications/DSH.app/Contents/Resources',
    exists: () => false,
    isExecutable: () => false,
    ...overrides,
  }
}

function config(
  overrides: { launcher?: 'auto' | 'desktop-cli' | 'path'; dshPath?: string | null } = {},
) {
  return {
    launcher: overrides.launcher ?? ('auto' as const),
    dshPath: overrides.dshPath ?? null,
  }
}

describe('resolveLauncher', () => {
  it('uses the Desktop CLI under Electron when it can find cli.js', () => {
    const launcher = resolveLauncher(
      deps({
        env: { ELECTRON_RUN_AS_NODE: '1' },
        exists: (path) => path === CLI,
      }),
      config(),
    )
    expect(launcher?.kind).toBe('desktop-cli')
    expect(launcher?.command).toBe('/Applications/DSH.app/Contents/MacOS/DSH')
    expect(launcher?.args).toEqual(['--expose-internals', CLI])
  })

  it('uses an explicit dshPath', () => {
    const launcher = resolveLauncher(
      deps({ env: { ELECTRON_RUN_AS_NODE: '1' }, exists: (path) => path === '/opt/dsh/cli.js' }),
      config({ dshPath: '/opt/dsh/cli.js' }),
    )
    expect(launcher?.kind).toBe('desktop-cli')
  })

  it('does not fall back to PATH when an explicit dshPath is missing', () => {
    const launcher = resolveLauncher(
      deps({
        env: { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin' },
        isExecutable: () => true,
      }),
      config({ dshPath: '/missing/cli.js' }),
    )
    expect(launcher).toBeNull()
  })

  it('ignores dshPath when launcher is path', () => {
    const launcher = resolveLauncher(
      deps({
        env: { PATH: '/usr/bin' },
        isExecutable: (candidate) => candidate === join('/usr/bin', 'dsh'),
      }),
      config({ launcher: 'path', dshPath: '/missing/cli.js' }),
    )
    expect(launcher?.kind).toBe('dsh')
  })

  it('falls back to a dsh executable on PATH', () => {
    const path = ['/usr/local/bin', '/usr/bin'].join(delimiter)
    const launcher = resolveLauncher(
      deps({
        env: { PATH: path },
        isExecutable: (candidate) => candidate === join('/usr/local/bin', 'dsh'),
      }),
      config(),
    )
    expect(launcher).toEqual({
      kind: 'dsh',
      command: join('/usr/local/bin', 'dsh'),
      args: [],
      spawnEnv: expect.any(Function),
    })
  })

  it('returns null when nothing can be launched', () => {
    expect(resolveLauncher(deps(), config())).toBeNull()
  })

  it('honours launcher=path even when the Desktop CLI exists', () => {
    const launcher = resolveLauncher(
      deps({
        env: { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin' },
        exists: () => true,
        isExecutable: (candidate) => candidate === join('/usr/bin', 'dsh'),
      }),
      config({ launcher: 'path' }),
    )
    expect(launcher?.kind).toBe('dsh')
  })

  it('honours launcher=desktop-cli and does not fall back to PATH', () => {
    const launcher = resolveLauncher(
      deps({
        env: { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin' },
        isExecutable: () => true,
      }),
      config({ launcher: 'desktop-cli' }),
    )
    expect(launcher).toBeNull()
  })

  it('uses Windows PATHEXT candidates', () => {
    const launcher = resolveLauncher(
      deps({
        platform: 'win32',
        env: { PATH: 'C:\\tools', PATHEXT: '.EXE;.CMD' },
        isExecutable: (candidate) => candidate === join('C:\\tools', 'dsh.CMD'),
      }),
      config({ launcher: 'path' }),
    )
    expect(launcher?.command).toBe(join('C:\\tools', 'dsh.CMD'))
  })
})

describe('launcherArgs', () => {
  it('starts the target without a browser, on an OS-assigned port', () => {
    const launcher: ResolvedLauncher = {
      kind: 'dsh',
      command: 'dsh',
      args: [],
      spawnEnv: () => ({}),
    }
    expect(launcherArgs(launcher, 'trading')).toEqual([
      '--profile',
      'trading',
      '--no-open',
      '--port',
      '0',
    ])
  })
})

describe('childEnv', () => {
  it('scrubs profile-scoped variables and sets the target home', () => {
    const env = childEnv(
      {
        PATH: '/usr/bin',
        HOME: '/Users/tester',
        DSH_PROFILE: 'desktop',
        DSH_PROFILE_DIR: '/Users/tester/.dsh/profiles/desktop',
        DSH_SESSION_ID: 'session',
        DSH_WEB_URL: 'http://127.0.0.1:1',
        DSH_SHELL: '1',
        ELECTRON_RUN_AS_NODE: '1',
      },
      '/Users/tester/.dsh-trading',
      false,
    )
    expect(env.DSH_HOME).toBe('/Users/tester/.dsh-trading')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.DSH_PROFILE).toBeUndefined()
    expect(env.DSH_PROFILE_DIR).toBeUndefined()
    expect(env.DSH_SESSION_ID).toBeUndefined()
    expect(env.DSH_WEB_URL).toBeUndefined()
    expect(env.DSH_SHELL).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
  })

  it('sets ELECTRON_RUN_AS_NODE for the Desktop CLI launcher', () => {
    const env = childEnv({}, '/tmp/.dsh', true)
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
  })
})
