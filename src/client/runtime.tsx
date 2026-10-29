import { createContext, useCallback, useContext, type ReactNode } from 'react'
import type { ProfileController } from './controller'
import { message, type MessageKey, type Translate } from './i18n'
import type { ClientState } from './state'
import type { Store } from './store'

/** Store type used by the plugin runtime. */
export type ProfileStore = Store<ClientState>

/** Values every slot entry receives from the plugin shell. */
export interface ProfileRuntime {
  store: ProfileStore
  controller: ProfileController
  /** Slot-injected translator for this plugin's namespace. */
  translate: Translate | undefined
}

const RuntimeContext = createContext<ProfileRuntime | null>(null)

/** @param props - runtime and children. */
export function RuntimeProvider({
  runtime,
  children,
}: {
  runtime: ProfileRuntime
  children: ReactNode
}) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
}

/** @returns the current plugin runtime. */
export function useRuntime(): ProfileRuntime {
  const runtime = useContext(RuntimeContext)
  if (runtime === null) throw new Error('profile-switcher: missing runtime provider')
  return runtime
}

/**
 * Typed translation helper with interpolation and a bundled fallback.
 * @returns a translate function bound to the current locale.
 */
export function useTranslate(): (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string {
  const { translate } = useRuntime()
  return useCallback(
    (key: MessageKey, params?: Readonly<Record<string, string | number>>) =>
      message(translate, key, params),
    [translate],
  )
}
