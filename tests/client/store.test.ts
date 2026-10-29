import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/client/store'

describe('createStore', () => {
  it('returns the initial snapshot and stable getSnapshot identity', () => {
    const store = createStore({ count: 0 })
    const first = store.getSnapshot()
    expect(first).toEqual({ count: 0 })
    expect(store.getSnapshot()).toBe(first)
  })

  it('updates with a patch and notifies subscribers', () => {
    const store = createStore({ count: 0, label: 'a' })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.update({ count: 1 })
    expect(store.getSnapshot()).toEqual({ count: 1, label: 'a' })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.update({ count: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('supports functional updates', () => {
    const store = createStore({ count: 1 })
    store.update((state) => ({ count: state.count + 1 }))
    expect(store.getSnapshot().count).toBe(2)
  })

  it('does not notify when no value changed', () => {
    const store = createStore({ count: 1, label: 'a' })
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()
    store.update({ count: 1 })
    store.update({})
    expect(listener).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toBe(before)
  })

  it('notifies exactly the snapshot that was current at update time', () => {
    const store = createStore({ value: 0 })
    const seen: number[] = []
    store.subscribe(() => seen.push(store.getSnapshot().value))
    store.update({ value: 1 })
    store.update({ value: 2 })
    expect(seen).toEqual([1, 2])
  })
})
