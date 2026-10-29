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
 * - `routes` exposes the four operations below the authenticated `/api` carrier.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeConfig } from '../shared/config'
import type { HostContext } from './context'
import { detectCurrentProfile } from './current-profile'
import { discoverHomes, homeLabel } from './homes'
import { resolveLauncher } from './launcher'
import { createProcessOperations, type SpawnLike } from './process'
import { listProfileDirectories } from './profiles'
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
  const logger = ctx.logger('profile-switcher')
  const config = normalizeConfig(rawConfig, (message) => logger.warn(message))

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

  const routesRegistered = registerRoutes(ctx, {
    supervisor,
    files,
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
  if (config.logLevel === 'debug' || config.logLevel === 'info') {
    logger.info(
      `ready; homes: ${labels === '' ? '(none)' : labels}; launcher: ${launcher?.kind ?? 'missing'}; routes: ${routesRegistered ? 'registered' : 'unavailable'}`,
    )
  }
}
