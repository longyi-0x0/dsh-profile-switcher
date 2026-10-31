import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionService, FetchRoute, HostContext, HostLogger } from '../../src/host/context'
import { apply } from '../../src/host/index'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  vi.unstubAllEnvs()
})

interface Harness {
  home: string
  routes: Map<string, FetchRoute>
  logger: HostLogger & {
    debug: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }
  effects: (() => void)[]
  ctx: HostContext
}

async function harness(options: { withConnection?: boolean } = {}): Promise<Harness> {
  const home = await mkdtemp(join(tmpdir(), 'dps-home-'))
  for (const name of ['desktop', 'web']) {
    const profile = join(home, 'profiles', name)
    await mkdir(profile, { recursive: true })
    await writeFile(
      join(profile, 'package.json'),
      JSON.stringify({ name: `dsh-profile-${name}`, dsh: { profile: { bundles: [name] } } }),
    )
  }
  vi.stubEnv('DSH_HOME', home)
  vi.stubEnv('DSH_PROFILE', 'desktop')

  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const routes = new Map<string, FetchRoute>()
  const effects: (() => void)[] = []
  const connection = {
    fetch: {
      register(route: FetchRoute) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
  } as ConnectionService
  const ctx: HostContext = {
    logger: () => logger,
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
    },
    connection:
      options.withConnection === false ? (undefined as unknown as ConnectionService) : connection,
  }
  cleanups.push(async () => {
    for (const dispose of effects.reverse()) dispose()
    await rm(home, { recursive: true, force: true })
  })
  return { home, routes, logger, effects, ctx }
}

async function callList(routes: Map<string, FetchRoute>): Promise<Record<string, unknown>> {
  const route = routes.get('/api/profile-switcher/list')
  if (route === undefined) throw new Error('list route not registered')
  const response = await route.fetch(new Request('http://dsh.internal/api/profile-switcher/list'))
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

async function post(
  routes: Map<string, FetchRoute>,
  operation: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const route = routes.get(`/api/profile-switcher/${operation}`)
  if (route === undefined) throw new Error(`${operation} route not registered`)
  const response = await route.fetch(
    new Request(`http://dsh.internal/api/profile-switcher/${operation}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

/** @param body - listing body. @returns every profile name below its homes. */
function profileNames(body: Record<string, unknown>): string[] {
  const homes = body.homes as { profiles: { name: string }[] }[]
  return homes.flatMap((home) => home.profiles.map((profile) => profile.name))
}

describe('host apply', () => {
  it('wires the supervisor, the allowed home, and the authenticated routes', async () => {
    const test = await harness()
    apply(test.ctx, { discoverSiblingHomes: false })

    expect([...test.routes.keys()].sort()).toEqual(
      [
        '/api/profile-switcher/list',
        '/api/profile-switcher/open',
        '/api/profile-switcher/status',
        '/api/profile-switcher/stop',
        '/api/profile-switcher/create',
        '/api/profile-switcher/delete',
      ].sort(),
    )

    const body = await callList(test.routes)
    expect(body.current).toEqual({ home: test.home, name: 'desktop' })
    const homes = body.homes as { path: string; label: string; profiles: { name: string }[] }[]
    expect(homes).toHaveLength(1)
    expect(homes[0]?.path).toBe(test.home)
    expect(homes[0]?.profiles.map((profile) => profile.name)).toEqual(['desktop', 'web'])
    expect(JSON.stringify(body)).not.toContain('token=')
  })

  it('creates a profile on disk that the listing then offers', async () => {
    const test = await harness()
    apply(test.ctx, { discoverSiblingHomes: false })

    const created = await post(test.routes, 'create', { home: test.home, name: 'lab' })
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ created: true })

    const directory = join(test.home, 'profiles', 'lab')
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
    expect(await readFile(join(directory, 'cordis.patch.yml'), 'utf8')).toContain('[]')
    expect(await readFile(join(directory, 'pnpm-workspace.yaml'), 'utf8')).toContain(
      'nodeLinker: hoisted',
    )

    const body = await callList(test.routes)
    expect(profileNames(body)).toContain('lab')
    const homes = body.homes as { profiles: { name: string; deletable: boolean }[] }[]
    const lab = homes.flatMap((home) => home.profiles).find((profile) => profile.name === 'lab')
    expect(lab?.deletable).toBe(true)

    const duplicate = await post(test.routes, 'create', { home: test.home, name: 'lab' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body).toEqual({ error: 'profile-exists' })
  })

  it('deletes a profile from disk and protects the app-managed one', async () => {
    const test = await harness()
    apply(test.ctx, { discoverSiblingHomes: false })
    expect((await post(test.routes, 'create', { home: test.home, name: 'lab' })).status).toBe(201)

    const deleted = await post(test.routes, 'delete', { home: test.home, name: 'lab' })
    expect(deleted.status).toBe(200)
    expect(deleted.body).toEqual({ deleted: true })
    await expect(readFile(join(test.home, 'profiles', 'lab', 'package.json'))).rejects.toThrow()
    expect(profileNames(await callList(test.routes))).not.toContain('lab')

    const managed = await post(test.routes, 'delete', { home: test.home, name: 'desktop' })
    expect(managed.status).toBe(409)
    expect(managed.body).toEqual({ error: 'profile-reserved' })
  })

  it('serves status for a profile that was never started without spawning', async () => {
    const test = await harness()
    apply(test.ctx, { discoverSiblingHomes: false })
    const route = test.routes.get('/api/profile-switcher/status')
    if (route === undefined) throw new Error('status route not registered')
    const url = `http://dsh.internal/api/profile-switcher/status?home=${encodeURIComponent(test.home)}&name=web`
    const response = await route.fetch(new Request(url))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ state: 'idle' })
  })

  it('ignores a stale DSH_PROFILE that is not present under the home', async () => {
    const test = await harness()
    vi.stubEnv('DSH_PROFILE', 'stale-profile')
    apply(test.ctx, { discoverSiblingHomes: false })
    const body = await callList(test.routes)
    expect(body.current).toBeNull()
    expect(test.logger.warn).toHaveBeenCalled()
  })

  it('reports a missing connection registry instead of throwing', async () => {
    const test = await harness({ withConnection: false })
    expect(() => apply(test.ctx, { discoverSiblingHomes: false })).not.toThrow()
    expect(test.routes.size).toBe(0)
    expect(test.logger.error).toHaveBeenCalled()
  })

  it('warns about invalid configuration but still mounts', async () => {
    const test = await harness()
    apply(test.ctx, { discoverSiblingHomes: false, maxRunning: 99, nope: true })
    expect(test.logger.warn).toHaveBeenCalled()
    expect(test.routes.size).toBe(6)
  })
})
