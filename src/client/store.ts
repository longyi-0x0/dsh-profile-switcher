import { useSyncExternalStore } from 'react'

/** Minimal immutable store with a stable subscribe/getSnapshot pair. */
export interface Store<T extends object> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  update(updater: Partial<T> | ((state: T) => Partial<T>)): void
}

/**
 * Create an immutable snapshot store.
 *
 * Updates that change no top-level value do not notify, which keeps
 * `useSyncExternalStore` from re-rendering on no-op transitions.
 *
 * @param initial - initial snapshot.
 * @returns the store.
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update(updater) {
      const patch = typeof updater === 'function' ? updater(state) : updater
      let changed = false
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (!Object.is(state[key], patch[key])) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...patch }
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * Subscribe a component to one slice of a store.
 * @param store - snapshot store.
 * @param selector - slice selector; return a stable value where possible.
 * @returns the selected value.
 */
export function useStoreValue<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  )
}
