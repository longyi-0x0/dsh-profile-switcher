import { useRef } from 'react'
import { useRuntime, useTranslate } from '../runtime'
import { useStoreValue } from '../store'
import { Wordmark } from './Wordmark'

/**
 * Sidebar brand occupant: the official wordmark on the left and the profile dropdown on
 * the right, mirroring the product-name + action layout of the shipped header. Only the
 * pill is interactive; the wordmark is `aria-hidden`.
 */
export function BrandTrigger() {
  const { store, controller } = useRuntime()
  const translate = useTranslate()
  const menuOpen = useStoreValue(store, (state) => state.menuOpen)
  const currentName = useStoreValue(store, (state) => state.currentName)
  const notice = useStoreValue(store, (state) => state.notice)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const name = currentName === '' ? translate('button.profileFallback') : currentName
  const label = `${translate('button.tip')}: ${name}`

  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    controller.openMenu(
      rect === undefined
        ? { left: 0, top: 0, bottom: 0 }
        : { left: rect.left, top: rect.top, bottom: rect.bottom },
    )
  }

  return (
    <span className="dps-brandWrap">
      <Wordmark height={20} className="dps-brandWordmark" />
      <span className="dps-brandSpacer" aria-hidden="true" />
      <button
        ref={triggerRef}
        type="button"
        className={menuOpen ? 'dps-brandPill dps-brandPillOpen' : 'dps-brandPill'}
        title={translate('button.tip')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls="dps-menu"
        data-profile-switcher-brand="1"
        onClick={() => {
          if (menuOpen) controller.closeMenu(false)
          else openMenu()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openMenu()
        }}
      >
        <span className="dps-brandProfile">{name}</span>
        <span className="dps-brandChev" aria-hidden="true">
          ▾
        </span>
      </button>
      <span className="dps-srOnly" role="status">
        {notice === 'web-fallback' ? translate('notice.webFallback') : ''}
      </span>
    </span>
  )
}
