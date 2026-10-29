/**
 * Wire contract shared by the Host and Client halves.
 *
 * Both bundles import this module, so a field rename fails `tsc` on the side that
 * was not updated. The API is internal to the plugin: the Client and Host ship in
 * one package and the routes are never a public integration surface.
 */

/** Route prefix registered below the DSH `/api` carrier. */
export const API_PREFIX = '/api/profile-switcher'

/** Version of the JSON contract; bump on incompatible changes. */
export const API_VERSION = 1

/**
 * Profile names accepted in URLs and request bodies. They become command-line
 * arguments and directory names, so only a conservative ASCII shape is allowed.
 */
export const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** Lifecycle state of one target profile's server. */
export type ProfileState = 'idle' | 'starting' | 'ready' | 'error' | 'stopping'

/** How the Host launches another profile. */
export type LauncherKind = 'desktop-cli' | 'dsh'

/** Machine-routable failures returned by an HTTP route. */
export type ApiErrorCode =
  | 'invalid-json'
  | 'invalid-body'
  | 'payload-too-large'
  | 'unknown-home'
  | 'invalid-profile-name'
  | 'profile-not-found'
  | 'profile-is-current'
  | 'too-many-profiles'
  | 'launcher-unavailable'
  | 'internal-error'

/** Runtime failures reported through `/status` instead of an HTTP error. */
export type RuntimeErrorCode = 'spawn-failed' | 'start-timeout' | 'exited' | 'stopped'

/** Timing knobs the Host publishes so the Client does not hard-code them. */
export interface Limits {
  startTimeoutMs: number
  pollIntervalMs: number
  maxPollIntervalMs: number
  keepaliveMs: number
  idleStopMs: number
}

/** One profile row in the switcher menu. */
export interface ProfileSummary {
  name: string
  current: boolean
  state: ProfileState
  bundles: number
  updatedAt?: number
  error?: RuntimeErrorCode
}

/** Profiles grouped under one DSH home. */
export interface HomeSummary {
  path: string
  label: string
  current: boolean
  profiles: ProfileSummary[]
}

/** Launch capability and the kind of launcher that was resolved. */
export interface LauncherSummary {
  kind: LauncherKind
}

/** Non-fatal environment problems worth surfacing in the menu. */
export interface Diagnostic {
  code: string
  detail?: string
}

/** `GET /api/profile-switcher/list` */
export interface ListResponse {
  apiVersion: typeof API_VERSION
  current: { home: string; name: string } | null
  homes: HomeSummary[]
  canLaunch: boolean
  launcher: LauncherSummary | null
  limits: Limits
  diagnostics: Diagnostic[]
}

/** `POST /api/profile-switcher/open` and `GET /api/profile-switcher/status`. */
export interface StatusResponse {
  state: ProfileState
  /** The authenticated launch URL. Only an owner browser session receives it. */
  url?: string
  error?: RuntimeErrorCode
  detail?: string
}

/** `POST /api/profile-switcher/stop` */
export interface StopResponse {
  state: 'idle'
  stopped: boolean
}

/** Any non-2xx response body. */
export interface ErrorResponse {
  error: ApiErrorCode
  detail?: string
}

/** `POST /api/profile-switcher/open` request body. */
export interface OpenRequest {
  home: string
  name: string
}
