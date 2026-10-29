import { dirname, join, resolve } from 'node:path'
import type { ProfileSwitcherConfig } from '../shared/config'

/** Injected environment/process facts, so launcher resolution is testable. */
export interface LauncherDeps {
  env: Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform
  execPath: string
  argv: readonly string[]
  resourcesPath: string | undefined
  exists(path: string): boolean
  isExecutable(path: string): boolean
}

/** A resolved way to boot another profile. */
export interface ResolvedLauncher {
  kind: 'desktop-cli' | 'dsh'
  command: string
  args: string[]
  spawnEnv(home: string): Record<string, string>
}

/** Environment variables that must not leak from the current profile into the child. */
const SCRUBBED_ENV = [
  'DSH_PROFILE',
  'DSH_PROFILE_DIR',
  'DSH_SESSION_ID',
  'DSH_WEB_URL',
  'DSH_SHELL',
] as const

/** @param deps - launcher facts. */
function findCli(deps: LauncherDeps): string | null {
  const candidates: string[] = []
  const argv1 = deps.argv[1] ?? ''
  if (/cli\.js$/u.test(argv1)) candidates.push(argv1)
  if (/\.js$/u.test(argv1)) candidates.push(join(dirname(argv1), 'cli.js'))

  // The Desktop runtime carries the CLI inside app.asar; packaged builds use
  // `app.asar`, a checkout or unpacked build uses `app`.
  const resources = deps.resourcesPath ?? resolve(dirname(deps.execPath), '..', 'Resources')
  for (const base of [join(resources, 'app.asar'), join(resources, 'app')]) {
    candidates.push(
      join(base, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js'),
    )
  }

  for (const candidate of candidates) {
    if (candidate !== '' && deps.exists(candidate)) return candidate
  }
  return null
}

/**
 * Windows resolves commands through PATHEXT; POSIX requires an executable bit.
 * @param env - parent environment.
 * @param platform - target platform.
 * @returns candidate extensions, including the empty one.
 */
function executableExtensions(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string[] {
  if (platform !== 'win32') return ['']
  const pathext = env.PATHEXT
  if (typeof pathext === 'string' && pathext.trim() !== '') {
    return [...pathext.split(';').filter(Boolean), '']
  }
  return ['.CMD', '.EXE', '.BAT', '.COM', '']
}

/** @param command - executable name. @param deps - launcher facts. */
function findOnPath(command: string, deps: LauncherDeps): string | null {
  const pathValue = deps.env.PATH
  if (typeof pathValue !== 'string' || pathValue === '') return null
  const extensions = executableExtensions(deps.env, deps.platform)
  const separator = deps.platform === 'win32' ? ';' : ':'
  for (const directory of pathValue.split(separator)) {
    if (directory === '') continue
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (deps.isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * Build the environment for a target profile server.
 *
 * The child gets the current environment minus profile-specific DSH variables, with
 * `DSH_HOME` pointing at the target home. `ELECTRON_RUN_AS_NODE` is set only for the
 * Desktop CLI path so the Electron binary behaves as Node.
 *
 * @param parent - current process environment.
 * @param home - target DSH home.
 * @param electron - whether the Desktop CLI launcher is used.
 * @returns a spawnable environment with only string values.
 */
export function childEnv(
  parent: Readonly<Record<string, string | undefined>>,
  home: string,
  electron: boolean,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parent)) {
    if (typeof value !== 'string') continue
    if ((SCRUBBED_ENV as readonly string[]).includes(key)) continue
    env[key] = value
  }
  env.DSH_HOME = home
  if (electron) env.ELECTRON_RUN_AS_NODE = '1'
  else delete env.ELECTRON_RUN_AS_NODE
  return env
}

/**
 * Resolve how to boot another profile.
 *
 * `auto` prefers the CLI shipped inside the Desktop installation when the Host runs
 * under Electron's Node mode, then falls back to a `dsh` executable on `PATH`.
 * An explicit config value disables the fallback so a typo is reported instead of
 * silently launching a different installation.
 *
 * @param deps - launcher facts.
 * @param config - normalized plugin config.
 * @returns the launcher, or null when nothing usable exists.
 */
export function resolveLauncher(
  deps: LauncherDeps,
  config: Pick<ProfileSwitcherConfig, 'launcher' | 'dshPath'>,
): ResolvedLauncher | null {
  const electron = deps.env.ELECTRON_RUN_AS_NODE === '1'

  const desktopLauncher = (cli: string): ResolvedLauncher => ({
    kind: 'desktop-cli',
    command: deps.execPath,
    args: ['--expose-internals', cli],
    spawnEnv: (home) => childEnv(deps.env, home, true),
  })

  const pathLauncher = (): ResolvedLauncher | null => {
    const executable = findOnPath('dsh', deps)
    if (executable === null) return null
    return {
      kind: 'dsh',
      command: executable,
      args: [],
      spawnEnv: (home) => childEnv(deps.env, home, false),
    }
  }

  if (config.launcher === 'path') return pathLauncher()
  if (config.dshPath !== null) {
    // An explicit path disables discovery: a typo must be reported, not replaced by a
    // different installation.
    return deps.exists(config.dshPath) ? desktopLauncher(config.dshPath) : null
  }
  const cli = findCli(deps)
  if (config.launcher === 'desktop-cli') return cli === null ? null : desktopLauncher(cli)
  if (electron && cli !== null) return desktopLauncher(cli)
  return pathLauncher()
}

/**
 * Arguments for booting one profile as its own Harness.
 * @param launcher - resolved launcher.
 * @param name - profile name.
 * @returns the full argv tail.
 */
export function launcherArgs(launcher: ResolvedLauncher, name: string): string[] {
  return [...launcher.args, '--profile', name, '--no-open', '--port', '0']
}
