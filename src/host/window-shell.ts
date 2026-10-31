/**
 * The native window host.
 *
 * `native-window/` in this package builds `dsh-profile-window` (tao + wry): a program that
 * opens one real application window around a URL. The plugin never ships or builds a
 * binary; it only starts an installed one, so the feature stays optional.
 *
 * Resolution order: `config.windowShell`, the binary shipped in the package
 * (`native-window/bin/<platform>-<arch>/`), `~/.cargo/bin`, `~/.local/bin`, then `PATH`. The
 * shipped binary is what makes a plugin update bring the program along; the user install
 * directories come before `PATH` because a GUI app inherits launchd's PATH, which has
 * neither. The URL travels on **stdin**: `ps` shows every local process's argv, and the URL
 * carries the target's bearer token. A shipped binary that lost its executable bit is fixed
 * up once via `makeExecutable`.
 */
import { join } from 'node:path'

/** Program name installed by `cargo install --path native-window`. */
export const WINDOW_SHELL_NAME = 'dsh-profile-window'

/** Facts the resolver reads. */
export interface WindowShellDeps {
  /** Explicit path from `config.windowShell`; null means discover. */
  configured: string | null
  env: Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform
  exists(path: string): boolean
  isExecutable(path: string): boolean
  /** Best effort: make a shipped file executable; returns whether it now is. */
  makeExecutable(path: string): boolean
  /** Root of the installed plugin package. */
  packageRoot: string
  /** User home; conventional install directories hang off it. */
  homeDir: string
  /** CPU architecture, as in `process.arch`. */
  arch: NodeJS.Architecture
}

/** A child process as far as starting the window host is concerned. */
export interface ShellChild {
  stdin: { end(chunk: string): void } | null
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'spawn', listener: () => void): unknown
  unref(): void
}

/** Spawn seam, matching `child_process.spawn` for the options used here. */
export type ShellSpawn = (command: string, args: string[]) => ShellChild

/** One window to open. */
export interface WindowRequest {
  /** Absolute program path. */
  command: string
  /** Authenticated target URL; written to stdin. */
  url: string
  /** Profile name, shown in the window title. */
  title: string
}

/** @param env - environment. @param platform - target platform. @returns candidate extensions. */
function executableExtensions(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string[] {
  if (platform !== 'win32') return ['']
  const pathext = env.PATHEXT
  if (typeof pathext === 'string' && pathext.trim() !== '') {
    return [...pathext.split(';').filter(Boolean), '']
  }
  return ['.EXE', '.CMD', '.BAT', '.COM', '']
}

/**
 * @param command - program name.
 * @param deps - environment and filesystem facts.
 * @returns the absolute path found on PATH, or null.
 */
function findOnPath(command: string, deps: WindowShellDeps): string | null {
  const pathValue = deps.env.PATH
  if (typeof pathValue !== 'string' || pathValue === '') return null
  const separator = deps.platform === 'win32' ? ';' : ':'
  for (const directory of pathValue.split(separator)) {
    if (directory === '') continue
    for (const extension of executableExtensions(deps.env, deps.platform)) {
      const candidate = join(directory, `${command}${extension}`)
      if (deps.isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * @param deps - configuration and filesystem facts.
 * @returns the window host program, or null when none is installed.
 */
export function resolveWindowShell(deps: WindowShellDeps): string | null {
  if (deps.configured !== null) {
    return deps.exists(deps.configured) && deps.isExecutable(deps.configured)
      ? deps.configured
      : null
  }
  const executable = deps.platform === 'win32' ? `${WINDOW_SHELL_NAME}.exe` : WINDOW_SHELL_NAME
  const bundled = join(
    deps.packageRoot,
    'native-window',
    'bin',
    `${deps.platform}-${deps.arch}`,
    executable,
  )
  if (deps.isExecutable(bundled)) return bundled
  if (deps.exists(bundled) && deps.makeExecutable(bundled)) return bundled

  for (const directory of ['.cargo', '.local']) {
    const installed = join(deps.homeDir, directory, 'bin', executable)
    if (deps.isExecutable(installed)) return installed
  }
  return findOnPath(WINDOW_SHELL_NAME, deps)
}

/**
 * Start the window host and hand it the URL.
 *
 * The host is detached so it outlives a plugin reload; it exits when its window closes.
 *
 * @param spawn - spawn seam.
 * @param request - program, URL, and title.
 * @returns a promise settled once the child has started and received the URL.
 */
export function launchWindowShell(spawn: ShellSpawn, request: WindowRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ShellChild
    try {
      child = spawn(request.command, ['--title', request.title])
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }
    child.on('error', (error) => {
      reject(error)
    })
    child.on('spawn', () => {
      child.stdin?.end(request.url)
      child.unref()
      resolve()
    })
  })
}
