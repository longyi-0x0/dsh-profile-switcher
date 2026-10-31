import { join } from 'node:path'
import { CLIENT_LIMITS, type ProfileSwitcherConfig } from '../shared/config'
import type {
  Diagnostic,
  HomeSummary,
  LauncherSummary,
  Limits,
  ProfileState,
  ProfileSummary,
  RuntimeErrorCode,
  StatusResponse,
  StopResponse,
} from '../shared/protocol'
import type { HostLogger } from './context'
import { ApiError } from './errors'
import { homeLabel } from './homes'
import { launcherArgs, type ResolvedLauncher } from './launcher'
import { terminateChild, type ChildLike, type ProcessOperations, type SpawnLike } from './process'
import { canDeleteProfile } from './profile-admin'
import type { ListedProfile } from './profiles'
import { loggableOrigin, sanitizeDetail } from './redact'
import { WebUrlScanner } from './web-url'

/** Filesystem-backed profile queries the supervisor needs. */
export interface ProfileFiles {
  /** @param profilesDir - `<home>/profiles`. @returns discovered profiles. */
  list(profilesDir: string): ListedProfile[]
  /** @param home - DSH home. @param name - profile name. @returns whether it exists. */
  hasProfile(home: string, name: string): boolean
}

/** Everything the supervisor takes from the composition. */
export interface SupervisorDeps {
  currentHome: string
  currentProfile: string | null
  homes: readonly string[]
  homeDir: string
  config: Readonly<ProfileSwitcherConfig>
  launcher: ResolvedLauncher | null
  logger: HostLogger
  files: ProfileFiles
  spawn: SpawnLike
  processes: ProcessOperations
  platform: NodeJS.Platform
}

type RunningState = Exclude<ProfileState, 'idle'>

interface RunRecord {
  home: string
  name: string
  child: ChildLike | null
  state: RunningState
  url: string | null
  error: RuntimeErrorCode | null
  detail: string | null
  stderr: string
  lastSeenAt: number
  startTimer: NodeJS.Timeout | null
  termination: Promise<void> | null
}

/** @param home - home path. @param name - profile name. */
function keyOf(home: string, name: string): string {
  return `${home}\u0000${name}`
}

/** @param error - unknown thrown value. @returns its message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Owns every target profile server: start, state, heartbeat tracking, idle
 * recovery, termination, and the bounded listing used by the menu.
 *
 * The supervisor never logs a launch URL: the URL contains a bearer token for the
 * target profile. Only its origin is logged.
 */
export class ProfileSupervisor {
  private readonly deps: SupervisorDeps
  private readonly records = new Map<string, RunRecord>()
  private sweepTimer: NodeJS.Timeout | null = null
  private disposed = false

  /** @param deps - composition seams. */
  constructor(deps: SupervisorDeps) {
    this.deps = deps
    this.scheduleSweep()
  }

  /** @returns whether a launcher was resolved. */
  get canLaunch(): boolean {
    return this.deps.launcher !== null
  }

  /** @returns the launcher summary published to the Client. */
  get launcherSummary(): LauncherSummary | null {
    return this.deps.launcher === null ? null : { kind: this.deps.launcher.kind }
  }

  /** @returns timing limits the Client must honor. */
  get limits(): Limits {
    return {
      startTimeoutMs: this.deps.config.startTimeoutMs,
      pollIntervalMs: CLIENT_LIMITS.pollIntervalMs,
      maxPollIntervalMs: CLIENT_LIMITS.maxPollIntervalMs,
      keepaliveMs: CLIENT_LIMITS.keepaliveMs,
      idleStopMs: this.deps.config.idleStopMs,
    }
  }

  /** @returns non-fatal environment diagnostics. */
  get diagnostics(): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    if (this.deps.launcher === null) diagnostics.push({ code: 'launcher-missing' })
    if (this.deps.currentProfile === null) diagnostics.push({ code: 'current-profile-unknown' })
    if (this.deps.homes.length === 0) diagnostics.push({ code: 'no-homes' })
    const profileCount = this.deps.homes.reduce(
      (total, home) => total + this.deps.files.list(join(home, 'profiles')).length,
      0,
    )
    if (profileCount === 0 && this.deps.homes.length > 0) diagnostics.push({ code: 'no-profiles' })
    return diagnostics
  }

  /** @returns home groups with live state for the menu. */
  summaries(): HomeSummary[] {
    return this.deps.homes.map((home) => {
      const profiles: ProfileSummary[] = this.deps.files
        .list(join(home, 'profiles'))
        .map((listed) => this.summaryOf(home, listed))
      return {
        path: home,
        label: homeLabel(home, this.deps.homeDir),
        current: home === this.deps.currentHome,
        profiles,
      }
    })
  }

  /**
   * Start or reuse one target profile.
   *
   * @param home - an allow-listed home.
   * @param name - a validated profile name.
   * @returns the accepted state; runtime failures are reported through `status`.
   */
  async open(home: string, name: string): Promise<StatusResponse> {
    const key = keyOf(home, name)
    let record = this.records.get(key)

    if (record !== undefined && record.state === 'stopping' && record.termination !== null) {
      await record.termination
      record = this.records.get(key)
    }

    if (record !== undefined) {
      if (record.state !== 'error') {
        this.touch(record)
        return this.statusOf(record)
      }
      await this.discard(record)
    }

    if (this.deps.launcher === null) {
      throw new ApiError('launcher-unavailable', 503)
    }

    const running = [...this.records.values()].filter(
      (candidate) => candidate.child !== null || candidate.state !== 'error',
    ).length
    if (running >= this.deps.config.maxRunning) {
      throw new ApiError(
        'too-many-profiles',
        429,
        `at most ${String(this.deps.config.maxRunning)} profiles may run at once`,
      )
    }

    const created: RunRecord = {
      home,
      name,
      child: null,
      state: 'starting',
      url: null,
      error: null,
      detail: null,
      stderr: '',
      lastSeenAt: Date.now(),
      startTimer: null,
      termination: null,
    }
    this.records.set(key, created)
    this.start(created)
    return this.statusOf(created)
  }

  /**
   * Read one profile's state and refresh its heartbeat.
   * @param home - allow-listed home.
   * @param name - validated profile name.
   * @returns the current state.
   */
  status(home: string, name: string): StatusResponse {
    const record = this.records.get(keyOf(home, name))
    if (record === undefined) return { state: 'idle' }
    if (record.state !== 'stopping') this.touch(record)
    return this.statusOf(record)
  }

  /**
   * Stop one profile and its process tree.
   * @param home - allow-listed home.
   * @param name - validated profile name.
   * @returns whether a server was running.
   */
  async stop(home: string, name: string): Promise<StopResponse> {
    const key = keyOf(home, name)
    const record = this.records.get(key)
    if (record === undefined) return { state: 'idle', stopped: false }

    record.state = 'stopping'
    record.url = null
    this.clearStartTimer(record)

    if (record.termination === null) {
      record.termination = this.terminateOnly(record).finally(() => {
        if (this.records.get(key) === record) this.records.delete(key)
      })
    }
    await record.termination
    return { state: 'idle', stopped: true }
  }

  /** Best-effort synchronous termination used on process exit. */
  shutdownSync(): void {
    for (const record of this.records.values()) {
      const child = record.child
      if (child === null || child.pid === undefined) continue
      if (this.deps.platform === 'win32') this.deps.processes.signalProcess(child, 'SIGTERM')
      else this.deps.processes.signalGroup(child.pid, 'SIGTERM')
    }
  }

  /**
   * Release every server owned by the plugin. Termination escalation continues in
   * the background; the Host process usually exits right after this.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
    for (const record of this.records.values()) {
      record.state = 'stopping'
      record.url = null
      this.clearStartTimer(record)
      const child = record.child
      record.child = null
      if (child === null) continue
      void terminateChild(child, {
        graceMs: this.deps.config.killGraceMs,
        platform: this.deps.platform,
        operations: this.deps.processes,
      }).catch(() => undefined)
    }
    this.records.clear()
  }

  // --- internals -------------------------------------------------------------

  /** @param record - freshly created record. */
  private start(record: RunRecord): void {
    const launcher = this.deps.launcher
    if (launcher === null) return

    let child: ChildLike
    try {
      child = this.deps.spawn(launcher.command, launcherArgs(launcher, record.name), {
        cwd: record.home,
        env: launcher.spawnEnv(record.home),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: this.deps.platform !== 'win32',
        windowsHide: true,
      })
    } catch (error) {
      this.fail(record, 'spawn-failed', sanitizeDetail(errorMessage(error)))
      return
    }

    record.child = child
    const scanner = new WebUrlScanner()

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      const url = scanner.push(chunk)
      if (url !== null && record.state === 'starting') this.markReady(record, url)
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => {
      record.stderr = `${record.stderr}${chunk}`.slice(-8_192)
    })
    child.on('error', (error) => {
      if (record.state !== 'stopping')
        this.fail(record, 'spawn-failed', sanitizeDetail(errorMessage(error)))
    })
    child.once('exit', (code, signal) => {
      this.onExit(record, code, signal)
    })

    record.startTimer = setTimeout(() => {
      if (record.state !== 'starting') return
      this.fail(
        record,
        'start-timeout',
        `no launch URL after ${String(this.deps.config.startTimeoutMs)} ms`,
      )
      // Keep the error record for the Client to read; only the process is discarded.
      void this.terminateOnly(record)
    }, this.deps.config.startTimeoutMs)
  }

  /** @param record - record that printed its URL. @param url - authenticated URL. */
  private markReady(record: RunRecord, url: string): void {
    this.clearStartTimer(record)
    record.state = 'ready'
    record.url = url
    record.error = null
    record.detail = null
    record.lastSeenAt = Date.now()
    const origin = loggableOrigin(url) ?? '<url>'
    this.deps.logger.info(`${record.name} (${record.home}) is serving at ${origin}`)
  }

  /** @param record - record that failed. @param code - runtime code. @param detail - sanitized. */
  private fail(record: RunRecord, code: RuntimeErrorCode, detail: string | null): void {
    this.clearStartTimer(record)
    record.state = 'error'
    record.error = code
    record.detail = detail === '' ? null : detail
    record.url = null
    this.deps.logger.warn(
      `${record.name} (${record.home}) failed: ${code}${detail === null || detail === '' ? '' : ` — ${detail}`}`,
    )
  }

  /**
   * @param record - exited record.
   * @param code - exit code.
   * @param signal - exit signal.
   */
  private onExit(record: RunRecord, code: number | null, signal: NodeJS.Signals | null): void {
    this.clearStartTimer(record)
    record.child = null
    const wasStopping = record.state === 'stopping'
    record.url = null
    if (wasStopping) return
    if (record.state !== 'error') {
      const reason = signal === null ? `code ${String(code)}` : `signal ${signal}`
      const tail = sanitizeDetail(record.stderr)
      this.fail(
        record,
        'exited',
        tail === '' ? `exited (${reason})` : `exited (${reason}): ${tail}`,
      )
    }
  }

  /**
   * Discard an error record before restarting it.
   * @param record - error record.
   */
  private async discard(record: RunRecord): Promise<void> {
    const key = keyOf(record.home, record.name)
    record.state = 'stopping'
    record.url = null
    this.clearStartTimer(record)
    if (record.termination === null) {
      record.termination = this.terminateOnly(record).finally(() => {
        if (this.records.get(key) === record) this.records.delete(key)
      })
    }
    await record.termination
  }

  /** @param record - record to terminate. */
  private async terminateOnly(record: RunRecord): Promise<void> {
    const child = record.child
    record.child = null
    if (child === null) return
    try {
      const exited = await terminateChild(child, {
        graceMs: this.deps.config.killGraceMs,
        platform: this.deps.platform,
        operations: this.deps.processes,
      })
      if (!exited) {
        this.deps.logger.warn(`${record.name} (${record.home}) did not exit after SIGKILL`)
      }
    } catch (error) {
      this.deps.logger.warn(
        `${record.name} (${record.home}) termination failed: ${sanitizeDetail(errorMessage(error))}`,
      )
    }
  }

  /** @param home - home path. @param listed - profile discovered on disk. */
  private summaryOf(home: string, listed: ListedProfile): ProfileSummary {
    const record = this.records.get(keyOf(home, listed.name))
    const summary: ProfileSummary = {
      name: listed.name,
      current: home === this.deps.currentHome && listed.name === this.deps.currentProfile,
      state: record?.state ?? 'idle',
      bundles: listed.bundles,
      deletable: canDeleteProfile(
        home,
        listed.name,
        this.deps.currentHome,
        this.deps.currentProfile,
      ),
    }
    if (listed.updatedAt !== undefined) summary.updatedAt = listed.updatedAt
    if (record?.error !== null && record?.error !== undefined) summary.error = record.error
    return summary
  }

  /** @param record - live record. */
  private statusOf(record: RunRecord): StatusResponse {
    if (record.state === 'ready' && record.url !== null) {
      return { state: 'ready', url: record.url }
    }
    if (record.state === 'error') {
      const response: StatusResponse = { state: 'error', error: record.error ?? 'spawn-failed' }
      if (record.detail !== null) response.detail = record.detail
      return response
    }
    return { state: record.state }
  }

  /** @param record - live record. */
  private touch(record: RunRecord): void {
    record.lastSeenAt = Date.now()
  }

  /** @param record - live record. */
  private clearStartTimer(record: RunRecord): void {
    if (record.startTimer === null) return
    clearTimeout(record.startTimer)
    record.startTimer = null
  }

  /** Schedule the bounded idle sweep; not started when idle recovery is disabled. */
  private scheduleSweep(): void {
    const idleStopMs = this.deps.config.idleStopMs
    if (idleStopMs <= 0) return
    const interval = Math.min(60_000, Math.max(15_000, Math.floor(idleStopMs / 4)))
    this.sweepTimer = setInterval(() => this.sweep(), interval)
    // The sweep must not keep the Host alive on its own.
    this.sweepTimer.unref?.()
  }

  /** Stop servers whose owner stopped polling them. */
  private sweep(): void {
    const now = Date.now()
    for (const record of [...this.records.values()]) {
      if (record.state === 'stopping') continue
      if (now - record.lastSeenAt < this.deps.config.idleStopMs) continue
      this.deps.logger.info(`${record.name} (${record.home}) is idle; stopping its server`)
      void this.stop(record.home, record.name)
    }
  }
}
