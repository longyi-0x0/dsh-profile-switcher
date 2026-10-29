import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type ProfileSwitcherConfig } from '../../src/shared/config'
import type {
  ChildLike,
  ChildStream,
  ProcessOperations,
  SpawnOptions,
} from '../../src/host/process'
import { ProfileSupervisor, type SupervisorDeps } from '../../src/host/supervisor'

const HOME = '/Users/tester/.dsh'
const HOME_DIR = '/Users/tester'
const URL = 'http://127.0.0.1:4321/?token=secret'

interface FakeChild {
  child: ChildLike
  exit: EventEmitter
  stdout: EventEmitter
  stderr: EventEmitter
}

function stream(): { stream: ChildStream; emitter: EventEmitter } {
  const emitter = new EventEmitter()
  const value = Object.assign(emitter, { setEncoding: vi.fn() }) as unknown as ChildStream
  return { stream: value, emitter }
}

function fakeChild(pid = 4242): FakeChild {
  const exit = new EventEmitter()
  const out = stream()
  const err = stream()
  const child = {
    pid,
    exitCode: null,
    signalCode: null,
    stdout: out.stream,
    stderr: err.stream,
    kill: vi.fn(() => true),
    once: exit.once.bind(exit),
    on: exit.on.bind(exit),
    off: exit.off.bind(exit),
  } as unknown as ChildLike
  return { child, exit, stdout: out.emitter, stderr: err.emitter }
}

function config(overrides: Partial<ProfileSwitcherConfig> = {}): ProfileSwitcherConfig {
  return {
    ...DEFAULT_CONFIG,
    idleStopMs: 0,
    startTimeoutMs: 1_000,
    maxRunning: 3,
    killGraceMs: 1_000,
    ...overrides,
  }
}

function harness(
  options: {
    config?: Partial<ProfileSwitcherConfig>
    launcher?: SupervisorDeps['launcher']
    profiles?: string[]
    spawn?: SupervisorDeps['spawn']
  } = {},
) {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const profiles = options.profiles ?? ['web', 'trading', 'work']
  const children: FakeChild[] = []
  const spawnCalls: { command: string; args: readonly string[]; options: SpawnOptions }[] = []
  const spawn: SupervisorDeps['spawn'] =
    options.spawn ??
    ((command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions })
      const next = fakeChild(4242 + children.length)
      children.push(next)
      return next.child
    })
  const processes: ProcessOperations = {
    signalGroup: vi.fn(),
    signalProcess: vi.fn(),
    taskkill: vi.fn(async () => undefined),
  }
  const deps: SupervisorDeps = {
    currentHome: HOME,
    currentProfile: 'desktop',
    homes: [HOME],
    homeDir: HOME_DIR,
    config: config(options.config),
    launcher:
      options.launcher === undefined
        ? {
            kind: 'dsh',
            command: 'dsh',
            args: [],
            spawnEnv: (home) => ({ DSH_HOME: home }),
          }
        : options.launcher,
    logger,
    files: {
      list: () => profiles.map((name) => ({ name, bundles: 1 })),
      hasProfile: (_home, name) => profiles.includes(name),
    },
    spawn,
    processes,
    platform: 'darwin',
  }
  const supervisor = new ProfileSupervisor(deps)
  return { supervisor, deps, logger, processes, children, spawnCalls }
}

function ready(child: FakeChild): void {
  child.stdout.emit('data', `dsh web: ${URL}\n`)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ProfileSupervisor', () => {
  it('starts a target with the expected command and environment', async () => {
    const { supervisor, spawnCalls } = harness()
    await expect(supervisor.open(HOME, 'web')).resolves.toEqual({ state: 'starting' })
    expect(spawnCalls).toHaveLength(1)
    const call = spawnCalls[0]
    if (call === undefined) throw new Error('spawn was not called')
    expect(call.command).toBe('dsh')
    expect(call.args).toEqual(['--profile', 'web', '--no-open', '--port', '0'])
    expect(call.options).toMatchObject({
      cwd: HOME,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(call.options.env).toEqual({ DSH_HOME: HOME })
  })

  it('reaches ready when the URL is printed and logs no token', async () => {
    const { supervisor, children, logger } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    ready(child)
    expect(supervisor.status(HOME, 'web')).toEqual({ state: 'ready', url: URL })
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(logger.info.mock.calls)).toContain('http://127.0.0.1:4321')
  })

  it('reuses a running target instead of spawning again', async () => {
    const { supervisor, children, spawnCalls } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    ready(child)
    await expect(supervisor.open(HOME, 'web')).resolves.toEqual({ state: 'ready', url: URL })
    expect(spawnCalls).toHaveLength(1)
  })

  it('reports an exited server as an error with a sanitized detail', async () => {
    const { supervisor, children } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    ready(child)
    child.stderr.emit('data', `crashed at ${URL}\n`)
    child.exit.emit('exit', 1, null)
    const status = supervisor.status(HOME, 'web')
    expect(status.state).toBe('error')
    expect(status.error).toBe('exited')
    expect(status.detail).toContain('code 1')
    expect(status.detail).toContain('crashed')
    expect(status.detail).not.toContain('secret')
  })

  it('times out a server that never prints a URL', async () => {
    vi.useFakeTimers()
    const { supervisor, processes } = harness()
    await supervisor.open(HOME, 'web')
    await vi.advanceTimersByTimeAsync(1_000)
    const status = supervisor.status(HOME, 'web')
    expect(status.state).toBe('error')
    expect(status.error).toBe('start-timeout')
    expect(processes.signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM')
  })

  it('reports a synchronous spawn failure', async () => {
    const { supervisor } = harness({
      spawn: () => {
        throw new Error('ENOENT')
      },
    })
    await expect(supervisor.open(HOME, 'web')).resolves.toEqual({
      state: 'error',
      error: 'spawn-failed',
      detail: 'ENOENT',
    })
  })

  it('refuses to exceed maxRunning', async () => {
    const { supervisor } = harness({ config: { maxRunning: 2 } })
    await supervisor.open(HOME, 'web')
    await supervisor.open(HOME, 'trading')
    await expect(supervisor.open(HOME, 'work')).rejects.toMatchObject({
      code: 'too-many-profiles',
      status: 429,
    })
  })

  it('stops a running server and removes it from the listing', async () => {
    const { supervisor, children, processes } = harness()
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    ready(child)
    const stopped = supervisor.stop(HOME, 'web')
    expect(processes.signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM')
    child.exit.emit('exit', 0, 'SIGTERM')
    await expect(stopped).resolves.toEqual({ state: 'idle', stopped: true })
    expect(supervisor.status(HOME, 'web')).toEqual({ state: 'idle' })
    expect(supervisor.summaries()[0]?.profiles.find((p) => p.name === 'web')?.state).toBe('idle')
  })

  it('reports stop for an unknown profile without spawning anything', async () => {
    const { supervisor, spawnCalls } = harness()
    await expect(supervisor.stop(HOME, 'web')).resolves.toEqual({ state: 'idle', stopped: false })
    expect(spawnCalls).toHaveLength(0)
  })

  it('stops an idle server after the configured timeout', async () => {
    vi.useFakeTimers({ now: 0 })
    const { supervisor, children, processes } = harness({ config: { idleStopMs: 60_000 } })
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    ready(child)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(processes.signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM')
    child.exit.emit('exit', 0, 'SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    expect(supervisor.status(HOME, 'web')).toEqual({ state: 'idle' })
    supervisor.dispose()
  })

  it('keeps a server alive while the Client reports heartbeats', async () => {
    vi.useFakeTimers({ now: 0 })
    const { supervisor, children, processes } = harness({ config: { idleStopMs: 60_000 } })
    await supervisor.open(HOME, 'web')
    const child = children[0]
    if (child === undefined) throw new Error('no child')
    ready(child)
    for (let elapsed = 0; elapsed < 120_000; elapsed += 15_000) {
      supervisor.status(HOME, 'web')
      await vi.advanceTimersByTimeAsync(15_000)
    }
    expect(processes.signalGroup).not.toHaveBeenCalled()
    supervisor.dispose()
  })

  it('dispose terminates every owned server and clears the listing', async () => {
    const { supervisor, children, processes } = harness()
    await supervisor.open(HOME, 'web')
    await supervisor.open(HOME, 'trading')
    const second = children[1]
    if (second === undefined) throw new Error('no second child')
    ready(second)
    supervisor.dispose()
    expect(processes.signalGroup).toHaveBeenCalledTimes(2)
    expect(supervisor.summaries()[0]?.profiles.every((p) => p.state === 'idle')).toBe(true)
  })

  it('reports diagnostics when no launcher exists', () => {
    const { supervisor } = harness({ launcher: null })
    expect(supervisor.canLaunch).toBe(false)
    expect(supervisor.launcherSummary).toBeNull()
    expect(supervisor.diagnostics).toContainEqual({ code: 'launcher-missing' })
  })

  it('exposes the configured limits to the Client', () => {
    const { supervisor } = harness({ config: { startTimeoutMs: 5_000, idleStopMs: 0 } })
    expect(supervisor.limits).toMatchObject({ startTimeoutMs: 5_000, idleStopMs: 0 })
    expect(supervisor.limits.keepaliveMs).toBeGreaterThan(supervisor.limits.pollIntervalMs)
  })
})
