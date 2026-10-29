import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  terminateChild,
  waitForExit,
  type ChildLike,
  type ProcessOperations,
} from '../../src/host/process'

interface FakeChild {
  child: ChildLike
  emitter: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function fakeChild(pid: number | undefined = 4242): FakeChild {
  const emitter = new EventEmitter()
  const kill = vi.fn(() => true)
  const child = {
    pid,
    exitCode: null,
    signalCode: null,
    stdout: null,
    stderr: null,
    kill,
    once: emitter.once.bind(emitter),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
  } as unknown as ChildLike
  return { child, emitter, kill }
}

function operations(): ProcessOperations {
  return {
    signalGroup: vi.fn(),
    signalProcess: vi.fn(),
    taskkill: vi.fn(async () => undefined),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('waitForExit', () => {
  it('resolves immediately when the child already exited', async () => {
    const { child } = fakeChild()
    Object.defineProperty(child, 'exitCode', { value: 0 })
    await expect(waitForExit(child, 100)).resolves.toBe(true)
  })

  it('resolves true on exit', async () => {
    const { child, emitter } = fakeChild()
    const result = waitForExit(child, 100)
    emitter.emit('exit', 0, null)
    await expect(result).resolves.toBe(true)
  })

  it('resolves false after the timeout', async () => {
    vi.useFakeTimers()
    const { child } = fakeChild()
    const result = waitForExit(child, 500)
    await vi.advanceTimersByTimeAsync(500)
    await expect(result).resolves.toBe(false)
  })
})

describe('terminateChild', () => {
  it('signals the POSIX process group and stops after a graceful exit', async () => {
    const { child, emitter } = fakeChild()
    const ops = operations()
    const result = terminateChild(child, { graceMs: 1_000, platform: 'darwin', operations: ops })
    expect(ops.signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM')
    emitter.emit('exit', 0, 'SIGTERM')
    await expect(result).resolves.toBe(true)
    expect(ops.signalGroup).toHaveBeenCalledTimes(1)
  })

  it('escalates to SIGKILL when the grace period expires', async () => {
    vi.useFakeTimers()
    const { child, emitter } = fakeChild()
    const ops = operations()
    const result = terminateChild(child, { graceMs: 1_000, platform: 'darwin', operations: ops })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ops.signalGroup).toHaveBeenLastCalledWith(4242, 'SIGKILL')
    emitter.emit('exit', null, 'SIGKILL')
    await expect(result).resolves.toBe(true)
  })

  it('uses taskkill on Windows after the grace period', async () => {
    vi.useFakeTimers()
    const { child, emitter } = fakeChild()
    const ops = operations()
    const result = terminateChild(child, { graceMs: 1_000, platform: 'win32', operations: ops })
    expect(ops.signalProcess).toHaveBeenCalledWith(child, 'SIGTERM')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ops.taskkill).toHaveBeenCalledWith(4242)
    emitter.emit('exit', 1, null)
    await expect(result).resolves.toBe(true)
  })

  it('resolves false when the pid is unavailable and the child never exits', async () => {
    vi.useFakeTimers()
    const base = fakeChild()
    const child = { ...base.child, pid: undefined } as ChildLike
    const ops = operations()
    const result = terminateChild(child, { graceMs: 100, platform: 'darwin', operations: ops })
    await vi.advanceTimersByTimeAsync(100)
    await expect(result).resolves.toBe(false)
    expect(ops.signalGroup).not.toHaveBeenCalled()
  })
})
