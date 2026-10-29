/**
 * Minimal structural types for the Cordis Host context this plugin uses.
 *
 * The plugin deliberately imports nothing from `@deepseek-ai/*` at runtime: profile
 * installations do not install the dependencies of a linked package, so a structural
 * contract keeps `link:` installs working. The fields below mirror the published
 * Cordis plugin shape (`ctx.logger`, `ctx.effect`) and the Host connection service.
 */

/** Logger facade returned by `ctx.logger(name)`. */
export interface HostLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** One exact Fetch route registered on the authenticated `/api` carrier. */
export interface FetchRoute {
  path: string
  methods: string[]
  /**
   * `streaming` hands the handler the raw request body stream instead of buffering
   * it inside the carrier. POST routes use it to enforce their own 16 KiB cap.
   */
  requestBody?: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response> | Response
}

/** The Host half of `@deepseek-ai/dsh-client-connection` that this plugin uses. */
export interface ConnectionService {
  fetch: {
    register(route: FetchRoute): () => void
  }
}

/** The subset of the Cordis context used by the plugin. */
export interface HostContext {
  logger(name: string): HostLogger
  effect(callback: () => void | (() => void), label: string): unknown
  connection: ConnectionService
}
