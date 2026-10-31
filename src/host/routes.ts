import {
  API_PREFIX,
  API_VERSION,
  PROFILE_NAME_PATTERN,
  type CreateProfileResponse,
  type DeleteProfileResponse,
  type ErrorResponse,
  type ListResponse,
  type ProfileTargetRequest,
  type StatusResponse,
  type WindowResponse,
} from '../shared/protocol'
import type { HostContext, HostLogger } from './context'
import { ApiError, isApiError } from './errors'
import {
  createProfile,
  deleteProfile,
  isCurrentProfile,
  isReservedProfile,
  type ProfileAdminDeps,
} from './profile-admin'
import { sanitizeDetail } from './redact'
import type { ProfileFiles, ProfileSupervisor } from './supervisor'

/** Composition facts the routes need beyond the supervisor. */
export interface RouteDeps {
  supervisor: ProfileSupervisor
  files: ProfileFiles
  /** Filesystem seams for creating and deleting profile directories. */
  admin: ProfileAdminDeps
  /** Ask the system browser for a new window showing a ready target's URL. */
  openWindow: (url: string) => Promise<WindowResponse>
  /** Whether the Host supports the new-window handoff at all. */
  canOpenWindow: boolean
  currentHome: string
  currentProfile: string | null
  homes: readonly string[]
  logger: HostLogger
}

/** Maximum accepted JSON body for POST routes. */
const MAX_BODY_BYTES = 16 * 1024

/** Guarded route handler shape. */
type Handler = (request: Request) => Promise<Response>

/** @param payload - JSON-compatible value. @param status - HTTP status. */
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** @param error - error carrying a stable wire code. */
function errorResponse(error: ApiError): Response {
  const body: ErrorResponse = { error: error.code }
  if (error.detail !== undefined) body.detail = sanitizeDetail(error.detail)
  return json(body, error.status)
}

/**
 * Enforce the request body limit while reading the stream, so a POST cannot make the
 * Host buffer the carrier's 300 MiB default.
 *
 * @param request - Fetch request.
 * @param limit - maximum accepted bytes.
 * @returns decoded body text.
 */
async function readBodyText(request: Request, limit = MAX_BODY_BYTES): Promise<string> {
  if (request.body === null) return ''
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > limit) {
    throw new ApiError('payload-too-large', 413)
  }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      throw new ApiError('payload-too-large', 413)
    }
    text += decoder.decode(next.value, { stream: true })
  }
  return text + decoder.decode()
}

/** @param request - POST request. @returns the parsed JSON value. */
async function readJson(request: Request): Promise<unknown> {
  const text = await readBodyText(request)
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError('invalid-json', 400)
  }
}

/** @param body - parsed body. @returns a string field, or undefined. */
function stringField(body: unknown, field: 'home' | 'name'): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const value = (body as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

/**
 * Register the plugin routes on the authenticated `/api` carrier.
 *
 * @param ctx - Host context.
 * @param deps - supervisor, profile lookup, and current-profile facts.
 * @returns whether the routes were registered.
 */
export function registerRoutes(ctx: HostContext, deps: RouteDeps): boolean {
  const registry = ctx.connection?.fetch
  if (registry === undefined || typeof registry.register !== 'function') {
    deps.logger.error(
      'ctx.connection.fetch is unavailable in this Harness build; profile switching routes were not registered',
    )
    return false
  }

  const guard = (handler: Handler): Handler => {
    return async (request) => {
      try {
        return await handler(request)
      } catch (error) {
        if (isApiError(error)) {
          if (error.status >= 500) deps.logger.warn(`route failed: ${error.code}`)
          return errorResponse(error)
        }
        deps.logger.error(
          `route failed: ${sanitizeDetail(error instanceof Error ? error.message : String(error))}`,
        )
        return json({ error: 'internal-error' } satisfies ErrorResponse, 500)
      }
    }
  }

  const register = (
    path: string,
    methods: string[],
    requestBody: 'buffered' | 'streaming',
    handler: Handler,
  ): void => {
    const routePath = `${API_PREFIX}/${path}`
    ctx.effect(
      () => registry.register({ path: routePath, methods, requestBody, fetch: guard(handler) }),
      `profile-switcher: ${methods.join('/')} ${routePath}`,
    )
  }

  /** @param value - home from a body or query. @returns an allow-listed home. */
  const requireHome = (value: string | null | undefined): string => {
    if (typeof value !== 'string' || value === '') throw new ApiError('unknown-home', 400)
    if (!deps.homes.includes(value)) throw new ApiError('unknown-home', 400)
    return value
  }

  /** @param value - profile name from a body or query. @returns a valid name. */
  const requireName = (value: string | null | undefined): string => {
    if (typeof value !== 'string' || !PROFILE_NAME_PATTERN.test(value)) {
      throw new ApiError('invalid-profile-name', 400)
    }
    return value
  }

  /** @param home - allow-listed home. @param name - valid name. */
  const requireProfile = (home: string, name: string): void => {
    if (!deps.files.hasProfile(home, name)) throw new ApiError('profile-not-found', 404)
    if (home === deps.currentHome && name === deps.currentProfile) {
      throw new ApiError('profile-is-current', 409)
    }
  }

  /** @param request - POST request. @returns validated open request fields. */
  const readTarget = async (request: Request): Promise<ProfileTargetRequest> => {
    const body = await readJson(request)
    const home = requireHome(stringField(body, 'home'))
    const name = requireName(stringField(body, 'name'))
    requireProfile(home, name)
    return { home, name }
  }

  /** @param request - POST request. @returns validated home and name without existence rules. */
  const readAddress = async (request: Request): Promise<ProfileTargetRequest> => {
    const body = await readJson(request)
    return {
      home: requireHome(stringField(body, 'home')),
      name: requireName(stringField(body, 'name')),
    }
  }

  register('list', ['GET'], 'buffered', async () => {
    const response: ListResponse = {
      apiVersion: API_VERSION,
      current:
        deps.currentProfile === null ? null : { home: deps.currentHome, name: deps.currentProfile },
      homes: deps.supervisor.summaries(),
      canLaunch: deps.supervisor.canLaunch,
      canOpenWindow: deps.canOpenWindow,
      launcher: deps.supervisor.launcherSummary,
      limits: deps.supervisor.limits,
      diagnostics: deps.supervisor.diagnostics,
    }
    return json(response)
  })

  register('open', ['POST'], 'streaming', async (request) => {
    const target = await readTarget(request)
    const status: StatusResponse = await deps.supervisor.open(target.home, target.name)
    return json(status, 202)
  })

  register('status', ['GET'], 'buffered', async (request) => {
    const url = new URL(request.url)
    const home = requireHome(url.searchParams.get('home'))
    const name = requireName(url.searchParams.get('name'))
    const status: StatusResponse = deps.supervisor.status(home, name)
    return json(status)
  })

  register('stop', ['POST'], 'streaming', async (request) => {
    // Unlike open, stop accepts a name whose profile directory disappeared while its
    // server was still running: the caller must be able to release the process.
    const body = await readJson(request)
    const home = requireHome(stringField(body, 'home'))
    const name = requireName(stringField(body, 'name'))
    const stopped = await deps.supervisor.stop(home, name)
    return json(stopped)
  })

  register('window', ['POST'], 'streaming', async (request) => {
    const target = await readTarget(request)
    const status = deps.supervisor.status(target.home, target.name)
    if (status.state !== 'ready' || status.url === undefined) {
      throw new ApiError('profile-not-ready', 409)
    }
    // The URL stays inside the Host: the response carries no token.
    const result = await deps.openWindow(status.url)
    return json(result satisfies WindowResponse)
  })

  register('create', ['POST'], 'streaming', async (request) => {
    const { home, name } = await readAddress(request)
    if (isReservedProfile(home, name, deps.currentHome)) {
      throw new ApiError('profile-reserved', 409)
    }
    createProfile(home, name, deps.admin)
    deps.logger.info(`created profile ${JSON.stringify(name)} in ${home}`)
    return json({ created: true } satisfies CreateProfileResponse, 201)
  })

  register('delete', ['POST'], 'streaming', async (request) => {
    const { home, name } = await readAddress(request)
    if (!deps.files.hasProfile(home, name)) throw new ApiError('profile-not-found', 404)
    if (isReservedProfile(home, name, deps.currentHome)) {
      throw new ApiError('profile-reserved', 409)
    }
    if (isCurrentProfile(home, name, deps.currentHome, deps.currentProfile)) {
      throw new ApiError('profile-is-current', 409)
    }
    // The directory owns the server's plugin tree: release the process first.
    await deps.supervisor.stop(home, name)
    deleteProfile(home, name, deps.admin)
    deps.logger.info(`deleted profile ${JSON.stringify(name)} in ${home}`)
    return json({ deleted: true } satisfies DeleteProfileResponse)
  })

  return true
}
