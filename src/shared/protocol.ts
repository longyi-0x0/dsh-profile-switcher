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
 * `node_modules` is refused for the same reason the CLI refuses it: it is the
 * profile's resolution directory, not a profile.
 */
export const PROFILE_NAME_PATTERN = /^(?!node_modules$)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

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
  | 'profile-exists'
  | 'profile-reserved'
  | 'profile-create-failed'
  | 'profile-delete-failed'
  | 'profile-not-ready'
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
  /**
   * Whether the menu may offer to delete this profile. The Host is the authority:
   * the running profile and the app-managed `desktop` profile are never deletable.
   */
  deletable: boolean
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
  /** Whether the Host can ask the system browser for a new window. */
  canOpenWindow: boolean
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

/** `POST /api/profile-switcher/create` */
export interface CreateProfileResponse {
  created: true
}

/** `POST /api/profile-switcher/delete` */
export interface DeleteProfileResponse {
  deleted: true
}

/**
 * `POST /api/profile-switcher/window`.
 *
 * A browser that cannot be scripted is an expected answer, not a request failure, so the
 * Client can fall back to a normal browser handoff.
 */
export interface WindowResponse {
  opened: boolean
  reason?: 'unsupported' | 'failed'
  /** Sanitized script failure; never contains the launch URL. */
  detail?: string
}

/** Any non-2xx response body. */
export interface ErrorResponse {
  error: ApiErrorCode
  detail?: string
}

/** Request body naming one profile: `/open`, `/stop`, `/create`, and `/delete`. */
export interface ProfileTargetRequest {
  home: string
  name: string
}
