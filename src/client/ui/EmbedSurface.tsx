import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { errorMessage } from '../i18n'
import { useRuntime, useTranslate } from '../runtime'
import { useStoreValue } from '../store'
import { disposeGuest, mountGuest, type MountedGuest } from '../embed'
import { computeTopbarLayout, readPlatform, readTopInset } from '../insets'
import { openExternalUrl, readBrowserBridge } from '../open-external'
import { Spinner } from './Spinner'

/** Workspace key used for the lease reservation. */
const LEASE_WORKSPACE = 'profile-switcher'

/**
 * Full-screen surface for `starting` / `embedded` / `error`.
 *
 * The guest is mounted by an effect that owns its whole lifetime: aborting the effect
 * removes the element and releases the lease exactly once.
 */
export function EmbedSurface() {
  const { store, controller, translate } = useRuntime()
  const message = useTranslate()
  const phase = useStoreValue(store, (state) => state.phase)
  const target = useStoreValue(store, (state) => state.target)
  const url = useStoreValue(store, (state) => state.url)
  const guestLoading = useStoreValue(store, (state) => state.guestLoading)
  const errorCode = useStoreValue(store, (state) => state.errorCode)
  const errorDetail = useStoreValue(store, (state) => state.errorDetail)
  const currentName = useStoreValue(store, (state) => state.currentName)
  const canOpenWindow = useStoreValue(store, (state) => state.canOpenWindow)
  const notice = useStoreValue(store, (state) => state.notice)
  const hostRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const [inset, setInset] = useState(() => readTopInset())
  const active = phase !== 'idle'

  useEffect(() => {
    if (!active) return
    const update = (): void => setInset(readTopInset())
    update()
    window.addEventListener('resize', update)
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-fullscreen'],
    })
    return () => {
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [active])

  useEffect(() => {
    if (phase === 'starting') backRef.current?.focus()
    if (phase === 'error') retryRef.current?.focus()
  }, [phase])

  useEffect(() => {
    if (phase !== 'embedded' || url === null) return undefined
    const host = hostRef.current
    if (host === null) return undefined
    const bridge = readBrowserBridge()
    if (bridge === null) {
      controller.guestFailure('embed-failed')
      return undefined
    }

    const abort = new AbortController()
    let mounted: MountedGuest | null = null
    let cancelled = false
    void mountGuest({
      bridge,
      host,
      url,
      workspace: LEASE_WORKSPACE,
      signal: abort.signal,
      openExternal: openExternalUrl,
      onReady: () => controller.guestReady(),
      onFailure: (failure) => controller.guestFailure(failure.code, failure.detail),
    })
      .then((guest) => {
        if (cancelled) {
          void disposeGuest(guest)
          return
        }
        mounted = guest
      })
      .catch((error: unknown) => {
        if (cancelled) return
        controller.guestFailure(
          'embed-failed',
          error instanceof Error ? error.message : String(error),
        )
      })

    return () => {
      cancelled = true
      abort.abort()
      if (mounted !== null) void disposeGuest(mounted)
    }
  }, [phase, url, controller])

  if (!active) return null

  const name = target?.name ?? ''
  const layout = computeTopbarLayout(inset, readPlatform())
  const containerStyle = { '--dps-inset': `${inset}px` } as CSSProperties
  const topbarStyle: CSSProperties = {
    top: layout.floating ? '8px' : '0px',
    height: layout.floating ? '30px' : `${inset}px`,
    paddingLeft: `${layout.leading}px`,
    paddingRight: `${layout.trailing}px`,
    background: layout.floating ? 'transparent' : 'var(--dsw-alias-bg-base)',
  }
  const errorText = errorCode === null ? '' : errorMessage(translate, errorCode)

  return (
    <div
      className="dps-embed"
      style={containerStyle}
      role="region"
      aria-label={message('embed.region')}
    >
      <div
        className={layout.floating ? 'dps-topbar dps-topbarFloat' : 'dps-topbar'}
        style={topbarStyle}
      >
        <button
          ref={backRef}
          type="button"
          className={layout.floating ? 'dps-back dps-btnFloat' : 'dps-back'}
          title={message('embed.back')}
          aria-label={message('embed.back')}
          onClick={() => controller.returnToApp()}
        >
          <span className="dps-backArrow" aria-hidden="true">
            ←
          </span>
          <span>{message('embed.back')}</span>
          {currentName === '' ? null : <span className="dps-backName">{currentName}</span>}
        </button>
        <span className="dps-topbarSpacer" />
        {notice === 'window-fallback' ? (
          <span className="dps-chip" role="status">
            {message('notice.windowFallback')}
          </span>
        ) : null}
        {url === null || !canOpenWindow ? null : (
          <button
            type="button"
            className={layout.floating ? 'dps-newTab dps-btnFloat' : 'dps-newTab'}
            onClick={() => void controller.openInWindow()}
          >
            {message('embed.newWindow')}
            <span aria-hidden="true">⧉</span>
          </button>
        )}
        {url === null ? null : (
          <button
            type="button"
            className={layout.floating ? 'dps-newTab dps-btnFloat' : 'dps-newTab'}
            onClick={() => controller.openInBrowser()}
          >
            {message('embed.openExternal')}
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>

      <div className="dps-guestHost" ref={hostRef} />

      {phase === 'starting' ? (
        <div className="dps-center" role="status">
          <Spinner />
          <div className="dps-centerTitle">{message('embed.starting', { name })}</div>
          <div className="dps-centerHint">{message('embed.cancelHint')}</div>
        </div>
      ) : null}

      {phase === 'embedded' && guestLoading ? (
        <div className="dps-loading" role="status">
          <Spinner />
          <div className="dps-centerHint">{message('embed.loading', { name })}</div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="dps-center">
          <div className="dps-errorCard" role="alert">
            <div className="dps-centerTitle">{message('embed.failed', { name })}</div>
            <div className="dps-errorText">{errorText}</div>
            {errorDetail === null ? null : <div className="dps-errorDetail">{errorDetail}</div>}
            <div className="dps-errorActions">
              <button
                ref={retryRef}
                type="button"
                className="dps-primary"
                onClick={() => void controller.retry()}
              >
                {message('embed.retry')}
              </button>
              {url === null ? null : (
                <button
                  type="button"
                  className="dps-ghost"
                  onClick={() => controller.openInBrowser()}
                >
                  {message('embed.openExternal')}
                </button>
              )}
              <button type="button" className="dps-ghost" onClick={() => controller.returnToApp()}>
                {message('embed.back')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
