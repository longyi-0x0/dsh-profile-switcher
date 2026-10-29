import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { asClientErrorCode, diagnosticMessage, errorMessage } from '../i18n'
import { useRuntime, useTranslate } from '../runtime'
import { useStoreValue } from '../store'
import type { HomeSummary, ProfileSummary } from '../../shared/protocol'
import { computeMenuPosition, type MenuGeometry } from './menu-position'
import { Spinner } from './Spinner'

/** Enabled rows only: disabled entries are skipped by arrow-key navigation. */
const ROW_SELECTOR = '[data-dps-row]:not([aria-disabled="true"])'

/** @returns the current viewport size. */
function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** Anchored profile menu rendered in `shell.overlay`. */
export function ProfileMenu() {
  const { store, controller, translate } = useRuntime()
  const message = useTranslate()
  const menuOpen = useStoreValue(store, (state) => state.menuOpen)
  const anchor = useStoreValue(store, (state) => state.anchor)
  const homes = useStoreValue(store, (state) => state.homes)
  const menuLoading = useStoreValue(store, (state) => state.menuLoading)
  const menuError = useStoreValue(store, (state) => state.menuError)
  const canLaunch = useStoreValue(store, (state) => state.canLaunch)
  const diagnostics = useStoreValue(store, (state) => state.diagnostics)
  const notice = useStoreValue(store, (state) => state.notice)
  const panelRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState<MenuGeometry>(() =>
    computeMenuPosition(anchor, viewportSize()),
  )

  useEffect(() => {
    if (!menuOpen) return
    const update = (): void => setGeometry(computeMenuPosition(anchor, viewportSize()))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [menuOpen, anchor])

  useEffect(() => {
    if (!menuOpen) return
    const first = panelRef.current?.querySelector<HTMLElement>(ROW_SELECTOR)
    first?.focus()
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target) === true) return
      if (target.closest('[data-profile-switcher-brand]') !== null) return
      // An outside click closes the menu without stealing focus from its target.
      controller.closeMenu(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [menuOpen, controller])

  if (!menuOpen) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      controller.closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      // Restore focus to the trigger, then let the browser continue from there.
      controller.closeMenu(true)
      return
    }
    const panel = panelRef.current
    if (panel === null) return
    const rows = [...panel.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
    if (rows.length === 0) return
    const index = rows.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      rows[(index + 1 + rows.length) % rows.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      rows[(index - 1 + rows.length) % rows.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      rows[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      rows[rows.length - 1]?.focus()
    }
  }

  const profiles = homes ?? []
  const empty = homes !== null && profiles.every((home) => home.profiles.length === 0)
  const diagnosticsText = diagnostics
    .map((diagnostic) => diagnosticMessage(translate, diagnostic.code))
    .filter((text): text is string => text !== null)

  return (
    <div
      ref={panelRef}
      id="dps-menu"
      className="dps-menu"
      role="menu"
      tabIndex={-1}
      aria-label={message('menu.title')}
      style={{
        left: `${geometry.left}px`,
        top: `${geometry.top}px`,
        width: `${geometry.width}px`,
        maxHeight: `${geometry.maxHeight}px`,
      }}
      onKeyDown={onKeyDown}
    >
      <div className="dps-menuHead">{message('menu.title')}</div>
      {notice === 'web-fallback' ? (
        <div className="dps-notice">{message('notice.webFallback')}</div>
      ) : null}
      {diagnosticsText.map((text) => (
        <div className="dps-diagnostics" key={text}>
          {text}
        </div>
      ))}
      {menuLoading ? <div className="dps-muted">{message('menu.loading')}</div> : null}
      {menuError !== null ? (
        <div className="dps-errorBox">
          <div className="dps-error">
            {errorMessage(translate, menuError.code)}
            {menuError.detail === undefined ? '' : ` — ${menuError.detail}`}
          </div>
          <button
            type="button"
            className="dps-retry"
            onClick={() => void controller.loadProfiles()}
          >
            {message('menu.retry')}
          </button>
        </div>
      ) : null}
      {!menuLoading && empty ? <div className="dps-muted">{message('menu.empty')}</div> : null}

      {profiles.map((home) => (
        <HomeGroup
          key={home.path}
          home={home}
          canLaunch={canLaunch}
          onSelect={(profile) => void controller.beginSelect(home.path, profile.name)}
        />
      ))}

      <div className="dps-menuHint">{message('menu.hint')}</div>
    </div>
  )
}

/** One home's profile rows. */
function HomeGroup({
  home,
  canLaunch,
  onSelect,
}: {
  home: HomeSummary
  canLaunch: boolean
  onSelect: (profile: ProfileSummary) => void
}) {
  const { translate } = useRuntime()
  const message = useTranslate()
  return (
    <div className="dps-homeGroup" role="group" aria-label={home.label}>
      <div className="dps-home" aria-hidden="true">
        {home.label}
      </div>
      {home.profiles.map((profile) => {
        const disabled = profile.current || !canLaunch
        const errorText =
          profile.error === undefined
            ? undefined
            : errorMessage(translate, asClientErrorCode(profile.error))
        return (
          <button
            key={profile.name}
            type="button"
            role="menuitem"
            className="dps-item"
            data-dps-row="1"
            disabled={disabled}
            aria-disabled={disabled ? 'true' : undefined}
            title={errorText ?? profile.name}
            onClick={() => onSelect(profile)}
          >
            <span className="dps-itemName">{profile.name}</span>
            {profile.current ? (
              <span className="dps-badge">{message('menu.current')}</span>
            ) : profile.state === 'idle' ? null : (
              <span className="dps-itemMeta">
                {profile.state === 'starting' ? <Spinner /> : null}
                {profile.state === 'ready'
                  ? message('menu.running')
                  : profile.state === 'starting'
                    ? message('menu.starting')
                    : profile.state === 'error'
                      ? message('menu.error')
                      : null}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
