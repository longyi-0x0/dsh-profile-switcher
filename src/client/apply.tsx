import type { ComponentType } from 'react'
import { createApi } from './api'
import { ProfileController } from './controller'
import type { ClientContext, SlotProps } from './context'
import { en, NS, zh } from './i18n'
import { openExternalUrl, readBrowserBridge } from './open-external'
import { RuntimeProvider } from './runtime'
import { createStore } from './store'
import { INITIAL_STATE } from './state'
import { STYLES } from './styles'
import { BrandTrigger } from './ui/BrandTrigger'
import { CreateProfileDialog } from './ui/CreateProfileDialog'
import { EmbedSurface } from './ui/EmbedSurface'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { ProfileMenu } from './ui/ProfileMenu'

/** Services required by the Client half. */
export const inject = ['slots', 'locale']

/** Restore focus to the brand trigger after the overlay closes. */
function focusTrigger(): void {
  document.querySelector<HTMLElement>('[data-profile-switcher-brand]')?.focus()
}

/**
 * Mount the Client half.
 *
 * Locale dictionaries, the stylesheet, the controller lifetime, and the four slot
 * registrations are all context-owned effects, so disabling or reloading the plugin
 * removes them.
 *
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  const store = createStore(INITIAL_STATE)
  const controller = new ProfileController({
    store,
    api: createApi(),
    canEmbed: readBrowserBridge() !== null,
    openExternal: openExternalUrl,
    focusTrigger,
  })

  // The trigger renders the active profile name from the listing, so load it once at
  // startup instead of waiting for the first menu open; otherwise the brand slot shows
  // the fallback label until the user clicks it.
  void controller.loadProfiles()

  /** Wrap a slot component with the plugin runtime and its error boundary. */
  const slot = (Component: ComponentType): ComponentType<SlotProps> => {
    return function ProfileSwitcherSlot({ t }: SlotProps) {
      return (
        <RuntimeProvider runtime={{ store, controller, translate: t }}>
          <ErrorBoundary>
            <Component />
          </ErrorBoundary>
        </RuntimeProvider>
      )
    }
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'profile-switcher: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-dsh-plugin', NS)
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'profile-switcher: styles')
  ctx.effect(() => () => controller.dispose(), 'profile-switcher: controller')

  const BrandSlot = slot(BrandTrigger)
  const MenuSlot = slot(ProfileMenu)
  const DialogSlot = slot(CreateProfileDialog)
  const EmbedSlot = slot(EmbedSurface)

  // The shipped brand occupant registers at priority 0; replacing it is a deliberate
  // UX choice documented in docs/adr/0003-brand-slot.md. A lower number wins.
  ctx.slots.inject(
    'sidebar.brand.name',
    () =>
      ctx.slots.register(
        { name: 'sidebar.brand.name', priority: -1_000_001, locale: NS },
        BrandSlot,
      ),
    'profile-switcher: brand trigger',
  )
  ctx.slots.inject(
    'shell.overlay',
    () =>
      ctx.slots.register(
        { name: 'shell.overlay', id: 'profile-switcher-menu', order: 1300, locale: NS },
        MenuSlot,
      ),
    'profile-switcher: menu',
  )
  ctx.slots.inject(
    'shell.overlay',
    () =>
      ctx.slots.register(
        { name: 'shell.overlay', id: 'profile-switcher-embed', order: 1400, locale: NS },
        EmbedSlot,
      ),
    'profile-switcher: embed surface',
  )
  ctx.slots.inject(
    'shell.overlay',
    () =>
      ctx.slots.register(
        { name: 'shell.overlay', id: 'profile-switcher-create', order: 1450, locale: NS },
        DialogSlot,
      ),
    'profile-switcher: create dialog',
  )
}
