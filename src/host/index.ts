/**
 * Host half of dsh-profile-switcher.
 *
 * The Desktop shell boots one hard-wired profile. Switching therefore means starting
 * the target profile as its own Harness (`dsh --profile <name> --no-open --port 0`),
 * then handing its authenticated URL to the Web UI, which embeds it in a leased
 * webview. This module only wires the pieces together:
 *
 * - `homes` / `current-profile` find what can be launched;
 * - `launcher` resolves the dsh executable to spawn;
 * - `supervisor` owns every child process and its lifecycle;
 * - `profile-admin` creates and deletes profile directories;
 * - `window-shell` starts the optional native window host;
 * - `routes` exposes the seven operations below the authenticated `/api` carrier.
 */
import { spawn } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeConfig } from '../shared/config'
import type { HostContext } from './context'
import { detectCurrentProfile } from './current-profile'
import { discoverHomes, homeLabel } from './homes'
import { resolveLauncher } from './launcher'
import { createScopedLogger } from './logger'
import { createProcessOperations, type SpawnLike } from './process'
import type { ProfileAdminDeps } from './profile-admin'
import {
  launchWindowShell,
  resolveWindowShell,
  type ShellChild,
  type ShellSpawn,
} from './window-shell'
import { listProfileDirectories } from './profiles'
import { sanitizeDetail } from './redact'
import { registerRoutes } from './routes'
import { ProfileSupervisor, type ProfileFiles } from './supervisor'

/** Services required before the plugin can mount. */
export const inject = ['connection']

/** @param value - candidate path. @returns whether it is executable by this user. */
function isExecutable(value: string): boolean {
  try {
    accessSync(value, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** @param env - process environment. @param homeDir - user home. @returns resolved DSH home. */
function harnessHome(env: Readonly<Record<string, string | undefined>>, homeDir: string): string {
  const configured = env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim())
  return join(homeDir, '.dsh')
}

/** Filesystem-backed profile queries. @returns the supervisor's file seam. */
function createProfileFiles(): ProfileFiles {
  return {
    list: (profilesDir) =>
      listProfileDirectories(profilesDir, {
        readdir: (path) => readdirSync(path, { withFileTypes: true }),
        exists: (path) => existsSync(path),
        readFile: (path) => readFileSync(path, 'utf8'),
        mtime: (path) => {
          try {
            return statSync(path).mtimeMs
          } catch {
            return undefined
          }
        },
      }),
    hasProfile: (home, name) => existsSync(join(home, 'profiles', name, 'package.json')),
  }
}

/**
 * Electron adds `resourcesPath` to `process`; plain Node does not declare it.
 * @returns the runtime resources directory when running under Electron.
 */
function resourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
}

/**
 * Filesystem-backed profile mutations. The directory operations are deliberately not
 * recursive on create: `mkdirSync` failing with `EEXIST` is the "profile exists" check
 * that keeps a race from adopting somebody else's directory.
 *
 * @returns the administrator seam.
 */
function createProfileAdmin(): ProfileAdminDeps {
  return {
    exists: (path) => existsSync(path),
    mkdir: (path) => {
      mkdirSync(path)
    },
    writeFile: (path, content) => {
      writeFileSync(path, content, { flag: 'wx' })
    },
    remove: (path) => {
      rmSync(path, { recursive: true, force: true })
    },
  }
}

/**
 * Adapt `child_process.spawn` to the window host's structural seam. The child is detached
 * so it outlives a plugin reload and exits with its own window.
 *
 * @param command - window host program.
 * @param args - `--title` and the profile name.
 */
const spawnWindowShell: ShellSpawn = (command, args) =>
  spawn(command, args, {
    stdio: ['pipe', 'ignore', 'ignore'],
    detached: true,
    windowsHide: true,
  }) as unknown as ShellChild

/**
 * Adapt `child_process.spawn` to the supervisor's structural seam.
 * @param command - executable.
 * @param args - arguments.
 * @param options - spawn options owned by the supervisor.
 */
const spawnLike: SpawnLike = (command, args, options) => spawn(command, [...args], options)

/**
 * Mount the Host half.
 *
 * @param ctx - Cordis context carrying the authenticated connection service.
 * @param rawConfig - plugin row `config`, validated by `normalizeConfig`.
 */
export function apply(ctx: HostContext, rawConfig?: unknown): void {
  const baseLogger = ctx.logger('profile-switcher')
  const config = normalizeConfig(rawConfig, (message) => baseLogger.warn(message))
  const logger = createScopedLogger(baseLogger, config.logLevel)

  const homeDir = homedir()
  const currentHome = harnessHome(process.env, homeDir)
  const homes = discoverHomes({
    homeDir,
    currentHome,
    additionalHomes: config.additionalHomes,
    discoverSiblingHomes: config.discoverSiblingHomes,
    exists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path, { withFileTypes: true }),
  })
  const files = createProfileFiles()
  const detectedProfile = detectCurrentProfile({
    env: process.env,
    argv: process.argv,
    profilesDir: join(currentHome, 'profiles'),
  })
  // A stale DSH_PROFILE can leak in from a parent shell; only trust it when the
  // profile actually exists under the home this Host serves.
  const currentProfile =
    detectedProfile !== null && files.hasProfile(currentHome, detectedProfile)
      ? detectedProfile
      : null
  if (detectedProfile !== null && currentProfile === null) {
    logger.warn(
      `detected profile ${JSON.stringify(detectedProfile)} is not present under ${currentHome}; ignoring it`,
    )
  }
  const launcher = resolveLauncher(
    {
      env: process.env,
      platform: process.platform,
      execPath: process.execPath,
      argv: process.argv,
      resourcesPath: resourcesPath(),
      exists: (path) => existsSync(path),
      isExecutable,
    },
    config,
  )

  const supervisor = new ProfileSupervisor({
    currentHome,
    currentProfile,
    homes,
    homeDir,
    config,
    launcher,
    logger,
    files,
    spawn: spawnLike,
    processes: createProcessOperations(),
    platform: process.platform,
  })

  ctx.effect(() => () => supervisor.dispose(), 'profile-switcher: spawned profile servers')

  // Cordis does not run effect cleanup on process exit, so kill the process groups
  // synchronously as the last resort. The listener is removed on plugin unload.
  const onProcessExit = (): void => supervisor.shutdownSync()
  process.once('exit', onProcessExit)
  ctx.effect(
    () => () => process.removeListener('exit', onProcessExit),
    'profile-switcher: process exit hook',
  )

  // A native window needs a window host: `native-window/` in the package, `cargo install
  // --path native-window`, or an explicit `config.windowShell`. Without one the Client
  // hides the action instead of failing it.
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const windowShell = resolveWindowShell({
    configured: config.windowShell,
    env: process.env,
    platform: process.platform,
    exists: (path) => existsSync(path),
    isExecutable,
    makeExecutable: (path) => {
      try {
        chmodSync(path, 0o755)
        return true
      } catch {
        return false
      }
    },
    packageRoot,
    homeDir,
    arch: process.arch,
  })
  if (windowShell === null) {
    logger.info(
      'no native window host found; "open in new window" stays unavailable (cargo install --path native-window)',
    )
  }

  const routesRegistered = registerRoutes(ctx, {
    supervisor,
    files,
    admin: createProfileAdmin(),
    openWindow: async ({ url, title }) => {
      if (windowShell === null) return { opened: false, reason: 'unsupported' }
      try {
        await launchWindowShell(spawnWindowShell, { command: windowShell, url, title })
        return { opened: true }
      } catch (error) {
        return {
          opened: false,
          reason: 'failed',
          detail: sanitizeDetail(error instanceof Error ? error.message : String(error)),
        }
      }
    },
    canOpenWindow: windowShell !== null,
    currentHome,
    currentProfile,
    homes,
    logger,
  })

  const labels = homes.map((home) => homeLabel(home, homeDir)).join(', ')
  if (launcher === null) {
    logger.warn(
      'no dsh launcher was found; profile switching is unavailable (set config.dshPath or install dsh on PATH)',
    )
  }
  if (currentProfile === null) {
    logger.warn('could not detect the current profile; the current row will be unmarked')
  }
  logger.info(
    `ready; homes: ${labels === '' ? '(none)' : labels}; launcher: ${launcher?.kind ?? 'missing'}; routes: ${routesRegistered ? 'registered' : 'unavailable'}`,
  )
}
