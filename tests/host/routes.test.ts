import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_PREFIX, type ListResponse, type StatusResponse } from '../../src/shared/protocol'
import { DEFAULT_CONFIG, type ProfileSwitcherConfig } from '../../src/shared/config'
import type { FetchRoute, HostContext, HostLogger } from '../../src/host/context'
import type { ProfileAdminDeps } from '../../src/host/profile-admin'
import { registerRoutes } from '../../src/host/routes'
import {
  ProfileSupervisor,
  type ProfileFiles,
  type SupervisorDeps,
} from '../../src/host/supervisor'

// ChildLike is exported from process.ts, not context.ts; import the real type.
import type {
  ChildLike as ProcessChild,
  ChildStream as ProcessStream,
} from '../../src/host/process'

const HOME = '/Users/tester/.dsh'

interface FakeChild {
  child: ProcessChild
  exit: EventEmitter
  stdout: EventEmitter
}

function fakeChild(pid = 4242): FakeChild {
  const exit = new EventEmitter()
  const outEmitter = new EventEmitter()
  const errEmitter = new EventEmitter()
  const child = {
    pid,
    exitCode: null,
    signalCode: null,
    stdout: Object.assign(outEmitter, { setEncoding: vi.fn() }) as unknown as ProcessStream,
    stderr: Object.assign(errEmitter, { setEncoding: vi.fn() }) as unknown as ProcessStream,
    kill: vi.fn(() => true),
    once: exit.once.bind(exit),
    on: exit.on.bind(exit),
    off: exit.off.bind(exit),
  } as unknown as ProcessChild
  return { child, exit, stdout: outEmitter }
}

function config(overrides: Partial<ProfileSwitcherConfig> = {}): ProfileSwitcherConfig {
  return { ...DEFAULT_CONFIG, idleStopMs: 0, startTimeoutMs: 10_000, ...overrides }
}

interface HarnessOptions {
  profiles?: string[]
  currentProfile?: string | null
  config?: Partial<ProfileSwitcherConfig>
  withRegistry?: boolean
  /** Profile directories that already exist for the create operation. */
  existingDirectories?: string[]
}

/** In-memory stand-in for the filesystem behind profile mutations. */
function fakeAdmin(existing: string[] = []) {
  const directories = new Set(existing)
  const files = new Map<string, string>()
  const removed: string[] = []
  const admin: ProfileAdminDeps = {
    exists: (path) => directories.has(path),
    mkdir: (path) => {
      if (directories.has(path)) throw new Error('EEXIST: file already exists')
      directories.add(path)
    },
    writeFile: (path, content) => {
      files.set(path, content)
    },
    remove: (path) => {
      removed.push(path)
      directories.delete(path)
    },
  }
  return { admin, directories, files, removed }
}

function harness(options: HarnessOptions = {}) {
  const profiles = options.profiles ?? ['desktop', 'web', 'trading']
  const currentProfile = options.currentProfile === undefined ? 'desktop' : options.currentProfile
  const admin = fakeAdmin(options.existingDirectories ?? [])
  const logger: HostLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const children: FakeChild[] = []
  const files: ProfileFiles = {
    list: () => profiles.map((name) => ({ name, bundles: 1 })),
    hasProfile: (_home, name) => profiles.includes(name),
  }
  const deps: SupervisorDeps = {
    currentHome: HOME,
    currentProfile,
    homes: [HOME],
    homeDir: '/Users/tester',
    config: config(options.config),
    launcher: {
      kind: 'desktop-cli',
      command: 'electron',
      args: ['cli.js'],
      spawnEnv: (home) => ({ DSH_HOME: home }),
    },
    logger,
    files,
    spawn: () => {
      const next = fakeChild(4_000 + children.length)
      children.push(next)
      return next.child
    },
    processes: {
      signalGroup: vi.fn(),
      signalProcess: vi.fn(),
      taskkill: vi.fn(async () => undefined),
    },
    platform: 'darwin',
  }
  const supervisor = new ProfileSupervisor(deps)

  const routes = new Map<string, FetchRoute>()
  const ctx: HostContext = {
    logger: () => logger,
    effect: (callback) => {
      callback()
    },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
  }
  if (options.withRegistry === false) {
    ctx.connection = undefined as unknown as HostContext['connection']
  }
  const registered = registerRoutes(ctx, {
    supervisor,
    files,
    admin: admin.admin,
    currentHome: HOME,
    currentProfile,
    homes: [HOME],
    logger,
  })

  async function call(path: string, init?: RequestInit): Promise<Response> {
    const route = routes.get(`${API_PREFIX}${path.split('?')[0]}`)
    if (route === undefined) throw new Error(`route not registered: ${path}`)
    return route.fetch(new Request(`http://dsh.internal${API_PREFIX}${path}`, init))
  }

  async function jsonCall(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: unknown }> {
    const response = await call(path, init)
    return { status: response.status, body: await response.json() }
  }

  return {
    supervisor,
    routes,
    registered,
    call,
    jsonCall,
    logger,
    children,
    profiles,
    admin,
  }
}

function post(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('profile routes', () => {
  it('registers all six authenticated routes', () => {
    const routes = harness().routes
    expect([...routes.keys()].sort()).toEqual(
      [
        `${API_PREFIX}/list`,
        `${API_PREFIX}/open`,
        `${API_PREFIX}/status`,
        `${API_PREFIX}/stop`,
        `${API_PREFIX}/create`,
        `${API_PREFIX}/delete`,
      ].sort(),
    )
    expect(routes.get(`${API_PREFIX}/open`)?.methods).toEqual(['POST'])
    expect(routes.get(`${API_PREFIX}/open`)?.requestBody).toBe('streaming')
    expect(routes.get(`${API_PREFIX}/create`)?.requestBody).toBe('streaming')
    expect(routes.get(`${API_PREFIX}/delete`)?.requestBody).toBe('streaming')
  })

  it('reports the listing without any launch URL', async () => {
    const { supervisor, children, jsonCall } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:4321/?token=secret\n')

    const { status, body } = await jsonCall('/list')
    expect(status).toBe(200)
    const listing = body as ListResponse
    expect(listing.apiVersion).toBe(1)
    expect(listing.current).toEqual({ home: HOME, name: 'desktop' })
    expect(listing.canLaunch).toBe(true)
    expect(listing.launcher).toEqual({ kind: 'desktop-cli' })
    expect(listing.homes).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('token=')
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(listing.limits.startTimeoutMs).toBe(10_000)
    const profiles = listing.homes.flatMap((home) => home.profiles)
    expect(profiles.find((profile) => profile.name === 'desktop')?.deletable).toBe(false)
    expect(profiles.find((profile) => profile.name === 'web')?.deletable).toBe(true)
  })

  it('opens a profile and reports starting', async () => {
    const { jsonCall } = harness()
    const result = await jsonCall('/open', post({ home: HOME, name: 'web' }))
    expect(result.status).toBe(202)
    expect(result.body).toEqual({ state: 'starting' })
  })

  it('rejects malformed JSON, bad bodies, and unknown homes', async () => {
    const { jsonCall } = harness()
    expect((await jsonCall('/open', post('{nope'))).status).toBe(400)
    expect((await jsonCall('/open', post('{}'))).status).toBe(400)
    expect((await jsonCall('/open', post({ home: '/elsewhere', name: 'web' }))).status).toBe(400)
  })

  it('rejects invalid profile names and unknown profiles', async () => {
    const { jsonCall } = harness()
    expect((await jsonCall('/open', post({ home: HOME, name: '--bad' }))).status).toBe(400)
    // The profile tree's own resolution directory is not a profile.
    expect((await jsonCall('/open', post({ home: HOME, name: 'node_modules' }))).status).toBe(400)
    expect((await jsonCall('/open', post({ home: HOME, name: 'missing' }))).status).toBe(404)
  })

  it('refuses to open the current profile', async () => {
    const { jsonCall } = harness()
    const result = await jsonCall('/open', post({ home: HOME, name: 'desktop' }))
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: 'profile-is-current' })
  })

  it('rejects a body larger than the 16 KiB cap', async () => {
    const { jsonCall } = harness()
    const result = await jsonCall(
      '/open',
      post({ home: HOME, name: 'web', padding: 'x'.repeat(20_000) }),
    )
    expect(result.status).toBe(413)
    expect(result.body).toEqual({ error: 'payload-too-large' })
  })

  it('returns the launch URL from status once the server is ready', async () => {
    const { supervisor, children, jsonCall } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:4321/?token=secret\n')

    const result = await jsonCall('/status?home=' + encodeURIComponent(HOME) + '&name=web')
    expect(result.status).toBe(200)
    expect(result.body).toEqual<StatusResponse>({
      state: 'ready',
      url: 'http://127.0.0.1:4321/?token=secret',
    })
  })

  it('stops a ready profile and reports whether it was running', async () => {
    const { supervisor, children, jsonCall } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:4321/?token=secret\n')
    const response = jsonCall('/stop', post({ home: HOME, name: 'web' }))
    child.exit.emit('exit', 0, 'SIGTERM')
    const result = await response
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ state: 'idle', stopped: true })
  })

  it('reports stopped=false for an unknown running profile', async () => {
    const { jsonCall } = harness()
    const result = await jsonCall('/stop', post({ home: HOME, name: 'web' }))
    expect(result.body).toEqual({ state: 'idle', stopped: false })
  })

  it('maps unexpected failures to an opaque internal error', async () => {
    const { supervisor, jsonCall, logger } = harness()
    vi.spyOn(supervisor, 'open').mockRejectedValue(
      new Error('boom at http://127.0.0.1:1/?token=secret'),
    )
    const result = await jsonCall('/open', post({ home: HOME, name: 'web' }))
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: 'internal-error' })
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('secret')
  })

  it('creates a profile directory with the Web bundle stack', async () => {
    const { jsonCall, admin } = harness()
    const result = await jsonCall('/create', post({ home: HOME, name: 'lab' }))
    expect(result.status).toBe(201)
    expect(result.body).toEqual({ created: true })
    const directory = join(HOME, 'profiles', 'lab')
    expect(admin.directories.has(directory)).toBe(true)
    const manifest = JSON.parse(admin.files.get(join(directory, 'package.json')) ?? '{}')
    expect(manifest).toEqual({
      name: 'dsh-profile-lab',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
    expect(admin.files.has(join(directory, 'cordis.patch.yml'))).toBe(true)
    expect(admin.files.has(join(directory, 'pnpm-workspace.yaml'))).toBe(true)
  })

  it('refuses to create an existing, reserved, or invalid profile', async () => {
    const existing = join(HOME, 'profiles', 'web')
    const { jsonCall } = harness({ existingDirectories: [existing] })
    const exists = await jsonCall('/create', post({ home: HOME, name: 'web' }))
    expect(exists.status).toBe(409)
    expect(exists.body).toEqual({ error: 'profile-exists' })

    const reserved = await jsonCall('/create', post({ home: HOME, name: 'desktop' }))
    expect(reserved.status).toBe(409)
    expect(reserved.body).toEqual({ error: 'profile-reserved' })

    expect((await jsonCall('/create', post({ home: HOME, name: '--bad' }))).status).toBe(400)
    expect((await jsonCall('/create', post({ home: '/elsewhere', name: 'lab' }))).status).toBe(400)
  })

  it('deletes a profile directory', async () => {
    const existing = join(HOME, 'profiles', 'web')
    const { jsonCall, admin } = harness({ existingDirectories: [existing] })
    const result = await jsonCall('/delete', post({ home: HOME, name: 'web' }))
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ deleted: true })
    expect(admin.removed).toEqual([join(HOME, 'profiles', 'web')])
  })

  it('refuses to delete the running, app-managed, or missing profile', async () => {
    const running = harness({ currentProfile: 'web' })
    const current = await running.jsonCall('/delete', post({ home: HOME, name: 'web' }))
    expect(current.status).toBe(409)
    expect(current.body).toEqual({ error: 'profile-is-current' })
    expect(running.admin.removed).toEqual([])

    const managed = await running.jsonCall('/delete', post({ home: HOME, name: 'desktop' }))
    expect(managed.status).toBe(409)
    expect(managed.body).toEqual({ error: 'profile-reserved' })

    const missing = await running.jsonCall('/delete', post({ home: HOME, name: 'missing' }))
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: 'profile-not-found' })
  })

  it('stops a running server before deleting its profile', async () => {
    const existing = join(HOME, 'profiles', 'web')
    const { supervisor, jsonCall, children } = harness({
      currentProfile: 'desktop',
      existingDirectories: [existing],
    })
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:4321/?token=secret\n')
    const response = jsonCall('/delete', post({ home: HOME, name: 'web' }))
    child.exit.emit('exit', 0, 'SIGTERM')
    const result = await response
    expect(result.status).toBe(200)
    expect(supervisor.status(HOME, 'web')).toEqual({ state: 'idle' })
  })

  it('reports unavailable when the connection registry is missing', () => {
    const { registered, logger } = harness({ withRegistry: false })
    expect(registered).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })
})
