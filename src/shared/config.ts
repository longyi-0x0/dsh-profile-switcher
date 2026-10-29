/**
 * Host configuration accepted from the plugin row's `config` block.
 *
 * The plugin keeps zero runtime dependencies, so this type is validated by hand in
 * `normalizeConfig` instead of a schema library. Every field is optional; the
 * defaults below preserve the pre-refactor behaviour except idle recovery.
 */

/** How the Host chooses the `dsh` executable to launch another profile. */
export type LauncherPreference = 'auto' | 'desktop-cli' | 'path'

/** Log verbosity forwarded to `ctx.logger`. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Normalized, fully defaulted configuration. */
export interface ProfileSwitcherConfig {
  /** Additional DSH homes besides the current home and `~/.dsh-*` siblings. */
  additionalHomes: string[]
  /** Whether `~/.dsh-*` sibling directories are scanned. */
  discoverSiblingHomes: boolean
  /** Launcher selection policy. */
  launcher: LauncherPreference
  /** Explicit `dsh` CLI path; bypasses discovery. */
  dshPath: string | null
  /** How long a target profile may take to print its URL. */
  startTimeoutMs: number
  /** Stop a target server after this long without a Client heartbeat; 0 disables. */
  idleStopMs: number
  /** Maximum number of concurrently running target servers. */
  maxRunning: number
  /** Grace period between SIGTERM and SIGKILL. */
  killGraceMs: number
  /** Log verbosity. */
  logLevel: LogLevel
}

export const DEFAULT_CONFIG: Readonly<ProfileSwitcherConfig> = Object.freeze({
  additionalHomes: [],
  discoverSiblingHomes: true,
  launcher: 'auto',
  dshPath: null,
  startTimeoutMs: 120_000,
  idleStopMs: 900_000,
  maxRunning: 3,
  killGraceMs: 5_000,
  logLevel: 'warn',
})

const KNOWN_KEYS = new Set<keyof ProfileSwitcherConfig>([
  'additionalHomes',
  'discoverSiblingHomes',
  'launcher',
  'dshPath',
  'startTimeoutMs',
  'idleStopMs',
  'maxRunning',
  'killGraceMs',
  'logLevel',
])

/** @param value - unknown row config. @returns a plain record or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** @param value - number candidate. @returns a finite number or undefined. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Clamp one numeric field and warn when the configured value is outside its range.
 * @param value - candidate value.
 * @param field - config key, used in the warning.
 * @param min - inclusive minimum.
 * @param max - inclusive maximum.
 * @param warn - warning sink.
 * @returns the clamped number, or undefined when the field is absent or invalid.
 */
function clampNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  warn: (message: string) => void,
): number | undefined {
  const number = finiteNumber(value)
  if (number === undefined) {
    if (value !== undefined) warn(`config.${field} must be a number; using the default`)
    return undefined
  }
  if (number < min || number > max) {
    const clamped = Math.min(max, Math.max(min, number))
    warn(
      `config.${field} must be between ${String(min)} and ${String(max)}; using ${String(clamped)}`,
    )
    return clamped
  }
  return Math.floor(number)
}

/**
 * Validate and default the plugin row config.
 *
 * Unknown keys, wrong types, and out-of-range numbers are reported through `warn`
 * and replaced by defaults rather than failing activation: a typo in a profile
 * patch must not take the sidebar down.
 *
 * @param raw - raw `config` value from the Cordis row.
 * @param warn - sink for configuration diagnostics.
 * @returns a frozen, fully populated configuration.
 */
export function normalizeConfig(
  raw: unknown,
  warn: (message: string) => void,
): Readonly<ProfileSwitcherConfig> {
  const record = asRecord(raw)
  if (record === undefined) {
    if (raw !== undefined && raw !== null) warn('config must be an object; using defaults')
    return DEFAULT_CONFIG
  }

  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key as keyof ProfileSwitcherConfig)) {
      warn(`config.${key} is not recognized and is ignored`)
    }
  }

  let additionalHomes: string[] = []
  const rawHomes = record.additionalHomes
  if (rawHomes !== undefined) {
    if (Array.isArray(rawHomes)) {
      additionalHomes = rawHomes.filter((home): home is string => {
        if (typeof home === 'string' && home.trim() !== '') return true
        warn('config.additionalHomes entries must be non-empty strings; ignoring one')
        return false
      })
    } else {
      warn('config.additionalHomes must be an array; using the default')
    }
  }

  let discoverSiblingHomes = DEFAULT_CONFIG.discoverSiblingHomes
  if (record.discoverSiblingHomes !== undefined) {
    if (typeof record.discoverSiblingHomes === 'boolean') {
      discoverSiblingHomes = record.discoverSiblingHomes
    } else {
      warn('config.discoverSiblingHomes must be a boolean; using the default')
    }
  }

  let launcher = DEFAULT_CONFIG.launcher
  if (record.launcher !== undefined) {
    if (
      record.launcher === 'auto' ||
      record.launcher === 'desktop-cli' ||
      record.launcher === 'path'
    ) {
      launcher = record.launcher
    } else {
      warn('config.launcher must be auto, desktop-cli, or path; using auto')
    }
  }

  let dshPath: string | null = null
  if (record.dshPath !== undefined && record.dshPath !== null) {
    if (typeof record.dshPath === 'string' && record.dshPath.trim() !== '') {
      dshPath = record.dshPath.trim()
    } else {
      warn('config.dshPath must be a non-empty string; using discovery')
    }
  }

  let logLevel = DEFAULT_CONFIG.logLevel
  if (record.logLevel !== undefined) {
    const candidate = record.logLevel
    if (
      candidate === 'debug' ||
      candidate === 'info' ||
      candidate === 'warn' ||
      candidate === 'error'
    ) {
      logLevel = candidate
    } else {
      warn('config.logLevel must be debug, info, warn, or error; using warn')
    }
  }

  const startTimeoutMs =
    clampNumber(record.startTimeoutMs, 'startTimeoutMs', 5_000, 600_000, warn) ??
    DEFAULT_CONFIG.startTimeoutMs
  const idleStopMs = resolveIdleStop(record.idleStopMs, warn)
  const maxRunning =
    clampNumber(record.maxRunning, 'maxRunning', 1, 10, warn) ?? DEFAULT_CONFIG.maxRunning
  const killGraceMs =
    clampNumber(record.killGraceMs, 'killGraceMs', 100, 60_000, warn) ?? DEFAULT_CONFIG.killGraceMs

  return Object.freeze({
    additionalHomes,
    discoverSiblingHomes,
    launcher,
    dshPath,
    startTimeoutMs,
    idleStopMs,
    maxRunning,
    killGraceMs,
    logLevel,
  })
}

/**
 * Idle stop accepts 0 to disable, otherwise a bounded positive interval.
 * @param value - raw value.
 * @param warn - warning sink.
 * @returns milliseconds.
 */
function resolveIdleStop(value: unknown, warn: (message: string) => void): number {
  if (value === undefined) return DEFAULT_CONFIG.idleStopMs
  const number = finiteNumber(value)
  if (number === undefined) {
    warn('config.idleStopMs must be a number; using the default')
    return DEFAULT_CONFIG.idleStopMs
  }
  if (number === 0) return 0
  if (number < 60_000 || number > 86_400_000) {
    const clamped = Math.min(86_400_000, Math.max(60_000, number))
    warn(`config.idleStopMs must be 0 or between 60000 and 86400000; using ${String(clamped)}`)
    return Math.floor(clamped)
  }
  return Math.floor(number)
}

/** Timing limits published to the Client; not configurable by design. */
export const CLIENT_LIMITS = Object.freeze({
  pollIntervalMs: 500,
  maxPollIntervalMs: 2_000,
  keepaliveMs: 30_000,
})
