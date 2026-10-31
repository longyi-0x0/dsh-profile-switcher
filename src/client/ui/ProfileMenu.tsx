import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { HomeSummary, ProfileSummary } from '../../shared/protocol'
import { asClientErrorCode, diagnosticMessage, errorMessage } from '../i18n'
import type { ProfileMutation } from '../state'
import { useRuntime, useTranslate } from '../runtime'
import { useStoreValue } from '../store'
import { computeMenuPosition, type MenuGeometry } from './menu-position'
import { Spinner } from './Spinner'

/** Enabled rows only: disabled entries are skipped by arrow-key navigation. */
const ROW_SELECTOR = '[data-dps-row]:not([aria-disabled="true"])'

/** How long a delete confirmation stays armed without a second click. */
const CONFIRM_MS = 5_000

/** @returns the current viewport size. */
function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** @param home - home owning the profile. @param name - profile name. */
function rowKey(home: string, name: string): string {
  return `${home}\u0000${name}`
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
  const mutation = useStoreValue(store, (state) => state.mutation)
  const canLaunch = useStoreValue(store, (state) => state.canLaunch)
  const diagnostics = useStoreValue(store, (state) => state.diagnostics)
  const notice = useStoreValue(store, (state) => state.notice)
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [geometry, setGeometry] = useState<MenuGeometry>(() =>
    computeMenuPosition(anchor, viewportSize()),
  )
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

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

  // A closed menu drops any armed confirmation.
  useEffect(() => {
    if (menuOpen) return
    setConfirmKey(null)
  }, [menuOpen])

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    }
  }, [])

  if (!menuOpen) return null

  const profiles = homes ?? []
  const empty = homes !== null && profiles.every((home) => home.profiles.length === 0)
  const diagnosticsText = diagnostics
    .map((diagnostic) => diagnosticMessage(translate, diagnostic.code))
    .filter((text): text is string => text !== null)
  // New profiles go into the home this Host serves, falling back to the first listing.
  const targetHome: HomeSummary | null =
    homes === null ? null : (homes.find((home) => home.current) ?? homes[0] ?? null)
  const actionError = mutation?.error ?? null

  const disarm = (): void => {
    if (confirmTimer.current !== null) {
      clearTimeout(confirmTimer.current)
      confirmTimer.current = null
    }
    setConfirmKey(null)
  }

  /** First click arms the confirmation, a second one deletes. */
  const requestDelete = (home: string, name: string): void => {
    const key = rowKey(home, name)
    if (confirmKey !== key) {
      disarm()
      setConfirmKey(key)
      confirmTimer.current = setTimeout(disarm, CONFIRM_MS)
      return
    }
    disarm()
    void controller.deleteProfile(home, name)
  }

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
      {actionError === null ? null : (
        <div className="dps-errorBox">
          <div className="dps-error">
            {errorMessage(translate, actionError.code)}
            {actionError.detail === undefined ? '' : ` — ${actionError.detail}`}
          </div>
        </div>
      )}
      {!menuLoading && empty ? <div className="dps-muted">{message('menu.empty')}</div> : null}

      {profiles.map((home) => (
        <HomeGroup
          key={home.path}
          home={home}
          canLaunch={canLaunch}
          confirmKey={confirmKey}
          mutation={mutation}
          onSelect={(profile) => void controller.beginSelect(home.path, profile.name)}
          onDelete={(name) => requestDelete(home.path, name)}
        />
      ))}

      {targetHome === null ? null : (
        <button
          type="button"
          role="menuitem"
          data-dps-row="1"
          className="dps-item dps-new"
          onClick={() => controller.openCreate()}
        >
          <span className="dps-itemName">
            <span className="dps-newPlus" aria-hidden="true">
              ＋
            </span>{' '}
            {message('menu.new')}
          </span>
        </button>
      )}
    </div>
  )
}

/** One home's profile rows: the row opens it, its action deletes it. */
function HomeGroup({
  home,
  canLaunch,
  confirmKey,
  mutation,
  onSelect,
  onDelete,
}: {
  home: HomeSummary
  canLaunch: boolean
  confirmKey: string | null
  mutation: ProfileMutation | null
  onSelect: (profile: ProfileSummary) => void
  onDelete: (name: string) => void
}) {
  const { translate } = useRuntime()
  const message = useTranslate()
  const deleteBusy = mutation?.kind === 'delete' && mutation.busy
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
        const deleting = deleteBusy && mutation?.name === profile.name
        const confirming = confirmKey === rowKey(home.path, profile.name)
        return (
          <div className="dps-row" key={profile.name}>
            <button
              type="button"
              role="menuitem"
              className="dps-item"
              data-dps-row="1"
              data-dps-open="1"
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
            {profile.deletable === true ? (
              <button
                type="button"
                role="menuitem"
                data-dps-row="1"
                className={confirming ? 'dps-act dps-actConfirm' : 'dps-act'}
                disabled={deleteBusy}
                aria-disabled={deleteBusy ? 'true' : undefined}
                aria-label={
                  deleting
                    ? message('menu.deleting', { name: profile.name })
                    : confirming
                      ? message('menu.deleteConfirmLabel', { name: profile.name })
                      : message('menu.delete', { name: profile.name })
                }
                title={
                  confirming
                    ? message('menu.deleteConfirmLabel', { name: profile.name })
                    : message('menu.delete', { name: profile.name })
                }
                onClick={() => onDelete(profile.name)}
              >
                {deleting ? '…' : confirming ? message('menu.deleteConfirm') : '×'}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
