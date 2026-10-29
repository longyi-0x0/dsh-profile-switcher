import type { ComponentType } from 'react'
import type { Translate } from './i18n'

/** Props every slot registration receives from the slot system. */
export interface SlotProps {
  t?: Translate
}

/** Registration options used by the three slots this plugin occupies. */
export interface SlotRegistrationOptions {
  name: string
  id?: string
  order?: number
  priority?: number
  locale?: string
}

/** The subset of the Client Cordis context used by the plugin. */
export interface ClientContext {
  slots: {
    inject(name: string, callback: () => unknown, label?: string): unknown
    register(options: SlotRegistrationOptions, component: ComponentType<SlotProps>): () => void
  }
  locale: {
    register(
      namespace: string,
      dictionaries: { zh: Record<string, string>; en: Record<string, string> },
    ): () => void
  }
  effect(callback: () => void | (() => void), label: string): unknown
}
