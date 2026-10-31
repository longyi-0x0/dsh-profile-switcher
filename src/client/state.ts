import type { Diagnostic, HomeSummary, LauncherKind, Limits } from '../shared/protocol'
import type { ClientErrorCode } from './i18n'

/** High-level overlay phase. */
export type Phase = 'idle' | 'starting' | 'embedded' | 'error'

/** The profile being opened. */
export interface Target {
  home: string
  name: string
}

/** Trigger rectangle captured when the menu opens. */
export interface MenuAnchor {
  left: number
  top: number
  bottom: number
}

/** A localized menu-load failure. */
export interface MenuError {
  code: ClientErrorCode
  detail?: string
}

/** One in-flight profile mutation started from the menu. */
export interface ProfileMutation {
  kind: 'create' | 'delete'
  /** Profile name the mutation targets. */
  name: string
  /** Whether the request is still running. */
  busy: boolean
  /** Last failure, cleared when the next attempt starts. */
  error: MenuError | null
}

/** Everything the Client renders. */
export interface ClientState {
  menuOpen: boolean
  anchor: MenuAnchor | null
  phase: Phase
  target: Target | null
  /** Authenticated launch URL; kept in memory only and never rendered. */
  url: string | null
  errorCode: ClientErrorCode | null
  errorDetail: string | null
  guestLoading: boolean
  homes: HomeSummary[] | null
  canLaunch: boolean
  /** Whether the create-profile dialog is open. */
  createOpen: boolean
  menuLoading: boolean
  menuError: MenuError | null
  /** Profile being created or deleted from the menu, if any. */
  mutation: ProfileMutation | null
  currentName: string
  currentHome: string | null
  launcherKind: LauncherKind | null
  diagnostics: Diagnostic[]
  limits: Limits
  notice: 'web-fallback' | null
}

/** Conservative defaults used before the first `/list` response arrives. */
export const DEFAULT_LIMITS: Limits = {
  startTimeoutMs: 120_000,
  pollIntervalMs: 500,
  maxPollIntervalMs: 2_000,
  keepaliveMs: 30_000,
  idleStopMs: 900_000,
}

/** Initial Client snapshot. */
export const INITIAL_STATE: ClientState = {
  menuOpen: false,
  anchor: null,
  phase: 'idle',
  target: null,
  url: null,
  errorCode: null,
  errorDetail: null,
  guestLoading: false,
  homes: null,
  canLaunch: true,
  createOpen: false,
  menuLoading: false,
  menuError: null,
  mutation: null,
  currentName: '',
  currentHome: null,
  launcherKind: null,
  diagnostics: [],
  limits: DEFAULT_LIMITS,
  notice: null,
}
