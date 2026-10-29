import { spawn } from 'node:child_process'

/** Exit listener signature used by `child_process`. */
export type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void

/** The stdout/stderr surface the supervisor needs (already decoded to UTF-8). */
export interface ChildStream {
  setEncoding(encoding: BufferEncoding): void
  on(event: 'data', listener: (chunk: string) => void): void
}

/** Structural subset of `ChildProcess`, so tests can supply fakes. */
export interface ChildLike {
  readonly pid?: number | undefined
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  readonly stdout: ChildStream | null
  readonly stderr: ChildStream | null
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'exit', listener: ExitListener): void
  on(event: 'error', listener: (error: Error) => void): void
  off(event: 'exit', listener: ExitListener): void
}

/** Spawn options this plugin uses. */
export interface SpawnOptions {
  cwd: string
  env: Record<string, string>
  stdio: ['ignore', 'pipe', 'pipe']
  detached: boolean
  windowsHide: boolean
}

/** Spawn seam, so the supervisor is testable without real processes. */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildLike

/** Signals and platform commands for one process tree. */
export interface ProcessOperations {
  signalGroup(pid: number, signal: NodeJS.Signals): void
  signalProcess(child: ChildLike, signal: NodeJS.Signals): void
  taskkill(pid: number): Promise<void>
}

/** @param child - process to observe. @param timeoutMs - maximum wait. */
export function waitForExit(child: ChildLike, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    const finish = (exited: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('exit', onExit)
      resolve(exited)
    }
    const onExit: ExitListener = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once('exit', onExit)
  })
}

/**
 * Terminate one server and its descendants.
 *
 * POSIX children are spawned detached, so signalling the negative pid reaches the
 * whole process group (the dsh CLI may spawn workers). Windows has no process
 * groups here, so `taskkill /T` removes the tree after a graceful attempt.
 *
 * @param child - spawned server.
 * @param options - grace period, platform, and operations.
 * @returns whether the process exited before the final deadline.
 */
export async function terminateChild(
  child: ChildLike,
  options: { graceMs: number; platform: NodeJS.Platform; operations: ProcessOperations },
): Promise<boolean> {
  const { graceMs, platform, operations } = options
  const pid = child.pid
  if (pid === undefined) return waitForExit(child, graceMs)

  if (platform === 'win32') {
    operations.signalProcess(child, 'SIGTERM')
    if (await waitForExit(child, graceMs)) return true
    await operations.taskkill(pid)
  } else {
    operations.signalGroup(pid, 'SIGTERM')
    if (await waitForExit(child, graceMs)) return true
    operations.signalGroup(pid, 'SIGKILL')
  }
  return waitForExit(child, 2_000)
}

/** The production process operations. */
export function createProcessOperations(): ProcessOperations {
  return {
    signalGroup(pid, signal) {
      try {
        // A negative pid addresses the process group created by detached spawn.
        process.kill(-pid, signal)
      } catch {
        // ESRCH: the group is already gone.
      }
    },
    signalProcess(child, signal) {
      try {
        child.kill(signal)
      } catch {
        // The process already exited.
      }
    },
    taskkill(pid) {
      return new Promise((resolve) => {
        const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
        killer.once('error', () => resolve())
        killer.once('exit', () => resolve())
      })
    },
  }
}
