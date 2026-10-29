/**
 * Client half of dsh-profile-switcher.
 *
 * Entry: the sidebar brand name (`HARNESS ▾`). Selecting a profile starts that
 * Harness through the Host routes and embeds it in a full-screen leased webview
 * (`dshDesktop.browser`), with a floating return control.
 */
window.__ModuleLoader__.load({
  id: 'dsh-profile-switcher',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'profile-switcher'
    const API = '/api/profile-switcher'
    const MENU_WIDTH = 248
    const LEASE_WORKSPACE = 'profile-switcher'


    const zh = {
      'button.tip': '切换配置（profile）',
      title: '切换配置',
      hint: '选中后全屏打开；左上角可返回',
      loading: '正在读取配置…',
      empty: '没有找到其他配置',
      retry: '重试',
      currentBadge: '当前',
      running: '运行中',
      embedStarting: '正在启动 {name}…',
      startFailed: '启动失败',
      embedLoading: '正在打开 {name}…',
      embedFailed: '无法打开 {name}',
      embedBack: '返回默认配置',
      embedNewTab: '在新标签页打开',
      embedCancelHint: '可点击左上角返回',
      notFound: '找不到这个配置',
      isCurrent: '这个配置正在使用中',
      invalidName: '配置名称不合法',
      unknownHome: '未知的配置目录',
      launcherMissing: '无法定位 dsh 启动器。',
      requestFailed: '请求失败',
      embedFailedGeneric: '内嵌窗口打开失败',
      timeout: '启动超时，请稍后重试',
      guestGone: '内嵌页面已退出',
    }

    const en = {
      'button.tip': 'Switch profile',
      title: 'Switch profile',
      hint: 'Opens full-screen; use the top-left button to go back',
      loading: 'Reading profiles…',
      empty: 'No other profiles found',
      retry: 'Retry',
      currentBadge: 'Current',
      running: 'Running',
      embedStarting: 'Starting {name}…',
      startFailed: 'Could not start',
      embedLoading: 'Opening {name}…',
      embedFailed: 'Could not open {name}',
      embedBack: 'Back to default',
      embedNewTab: 'Open in new tab',
      embedCancelHint: 'Use the top-left button to go back',
      notFound: 'Profile not found',
      isCurrent: 'This profile is already in use',
      invalidName: 'Invalid profile name',
      unknownHome: 'Unknown profile directory',
      launcherMissing: 'No dsh launcher was found.',
      requestFailed: 'Request failed',
      embedFailedGeneric: 'The embedded window failed to open',
      timeout: 'Timed out while starting; try again',
      guestGone: 'The embedded page exited',
    }

    const fallbackDictionary = (navigator.language || '').toLowerCase().startsWith('zh') ? zh : en
    let translate = (key) => fallbackDictionary[key] ?? key

    function t(key, params) {
      let text
      try {
        text = translate(key)
      } catch {
        text = undefined
      }
      if (typeof text !== 'string' || text === '' || text === key) text = fallbackDictionary[key] ?? key
      if (params) {
        for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
      }
      return text
    }

    function serverError(code) {
      switch (code) {
        case 'profile-not-found':
          return t('notFound')
        case 'profile-is-current':
          return t('isCurrent')
        case 'invalid-profile-name':
          return t('invalidName')
        case 'unknown-home':
          return t('unknownHome')
        case 'launcher-unavailable':
          return t('launcherMissing')
        default:
          return code ? String(code) : t('requestFailed')
      }
    }

    const store = {
      menuOpen: false,
      anchor: null,
      phase: 'idle',
      target: null,
      url: null,
      error: '',
      guestLoading: false,
      homes: null,
      canLaunch: true,
      menuLoading: false,
      menuError: '',
      currentName: '',
      listeners: new Set(),
    }
    let startToken = 0

    function notify() {
      for (const listener of [...store.listeners]) listener()
    }

    function commit(patch) {
      Object.assign(store, patch)
      notify()
    }

    function useStore() {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        const listener = () => force((value) => value + 1)
        store.listeners.add(listener)
        return () => store.listeners.delete(listener)
      }, [])
      return store
    }

    async function request(path, options) {
      let response
      try {
        response = await fetch(API + path, options)
      } catch (error) {
        throw new Error(`${t('requestFailed')}: ${error instanceof Error ? error.message : String(error)}`)
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw new Error(serverError(payload && payload.error))
      return payload || {}
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const messageOf = (failure) => (failure instanceof Error ? failure.message : String(failure))

    /**
     * Electron wraps webview.loadURL rejections in a RemoteError whose code is
     * GUEST_VIEW_MANAGER_CALL; the real net error only survives in the message.
     * A token URL answers 303 into the cookie redirect, which aborts the original
     * navigation with ERR_ABORTED — the shipped sidebar browser ignores exactly
     * that error, and the redirect keeps loading.
     */
    function isAbortedLoad(failure) {
      const code = failure && (failure.code ?? failure.errno)
      if (code === 'ERR_ABORTED' || code === -3) return true
      const text = String((failure && (failure.message || failure)) || '')
      return text.includes('ERR_ABORTED') || text.includes('(-3)')
    }

    async function loadProfiles() {
      commit({ menuLoading: true, menuError: '' })
      try {
        const payload = await request('/list')
        const currentHome = (payload.homes || []).find((home) => home.current)
        const currentProfile = currentHome && (currentHome.profiles || []).find((profile) => profile.current)
        commit({
          homes: Array.isArray(payload.homes) ? payload.homes : [],
          canLaunch: payload.canLaunch !== false,
          currentName: currentProfile ? currentProfile.name : '',
          menuLoading: false,
        })
      } catch (failure) {
        commit({ menuLoading: false, menuError: messageOf(failure) })
      }
    }

    function closeMenu() {
      if (!store.menuOpen) return
      commit({ menuOpen: false })
      const trigger = document.querySelector('[data-profile-switcher-brand]')
      if (trigger && typeof trigger.focus === 'function') trigger.focus()
    }

    function stopTarget(target) {
      if (!target) return
      void request('/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ home: target.home, name: target.name }),
      }).catch(() => {})
    }

    function returnToApp() {
      const target = store.target
      startToken += 1
      commit({ phase: 'idle', target: null, url: null, error: '', guestLoading: false })
      stopTarget(target)
    }

    function beginSelect(home, name) {
      if (store.phase === 'starting' || store.phase === 'embedded') return
      const token = ++startToken
      commit({
        menuOpen: false,
        phase: 'starting',
        target: { home, name },
        url: null,
        error: '',
        guestLoading: false,
      })
      void (async () => {
        try {
          const opened = await request('/open', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ home, name }),
          })
          if (token !== startToken || store.phase !== 'starting') {
            if (token !== startToken) stopTarget({ home, name })
            return
          }
          if (opened.state === 'error') throw new Error(opened.error || t('startFailed'))
          const deadline = Date.now() + 120_000
          while (Date.now() < deadline) {
            if (token !== startToken || store.phase !== 'starting') return
            await delay(700)
            if (token !== startToken || store.phase !== 'starting') return
            const status = await request(
              `/status?home=${encodeURIComponent(home)}&name=${encodeURIComponent(name)}`,
            )
            if (status.state === 'ready' && status.url) {
              if (token !== startToken) return
              commit({ phase: 'embedded', url: status.url, guestLoading: true })
              return
            }
            if (status.state === 'error') throw new Error(status.error || t('startFailed'))
          }
          throw new Error(t('timeout'))
        } catch (failure) {
          if (token === startToken && store.phase === 'starting') {
            commit({ phase: 'error', error: messageOf(failure) })
          }
        }
      })()
    }

    function retryEmbed() {
      if (store.target) beginSelect(store.target.home, store.target.name)
    }

    function openInTab() {
      if (!store.url) return
      const opened = window.open(store.url, '_blank', 'noopener,noreferrer')
      if (!opened && !globalThis.dshDesktop) window.location.assign(store.url)
    }

    function embedBridge() {
      const carrier = globalThis.dshDesktop
      if (!carrier || carrier.protocolVersion !== 1 || !carrier.browser) return undefined
      return carrier.browser
    }

    function topInset() {
      const root = document.documentElement
      if (root.hasAttribute('data-fullscreen')) return 0
      const raw = Number.parseFloat(getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance'))
      if (Number.isFinite(raw) && raw > 0) return raw
      const platform = root.dataset.platform
      if (platform === 'darwin') return 38
      if (platform === 'win32') return 40
      return 0
    }

    function Spinner() {
      return h('span', { className: 'dps-spinner', 'aria-hidden': true })
    }

    function BrandTrigger() {
      const state = useStore()
      const triggerRef = React.useRef(null)
      React.useEffect(() => {
        void request('/list')
          .then((payload) => {
            const currentHome = (payload.homes || []).find((home) => home.current)
            const currentProfile = currentHome && (currentHome.profiles || []).find((profile) => profile.current)
            if (currentProfile) commit({ currentName: currentProfile.name })
          })
          .catch(() => {})
      }, [])
      return h(
        'span',
        { className: 'dps-brandWrap' },
        h('span', { className: 'dps-brandName' }, 'deepseek harness'),
        h(
          'button',
          {
            ref: triggerRef,
            type: 'button',
            className: state.menuOpen ? 'dps-brand dps-brandOpen' : 'dps-brand',
            title: t('button.tip'),
            'aria-label': t('button.tip'),
            'aria-haspopup': 'menu',
            'aria-expanded': state.menuOpen,
            'data-profile-switcher-brand': '1',
            onClick: () => {
              if (store.menuOpen) {
                closeMenu()
                return
              }
              const rect = triggerRef.current ? triggerRef.current.getBoundingClientRect() : null
              commit({
                menuOpen: true,
                anchor: rect ? { left: rect.left, top: rect.top, bottom: rect.bottom } : null,
              })
              void loadProfiles()
            },
          },
          state.currentName
            ? h('span', { className: 'dps-brandProfile' }, state.currentName)
            : h('span', { className: 'dps-brandProfile' }, 'profile'),
          h('span', { className: 'dps-brandChev', 'aria-hidden': true }, '▾'),
        ),
      )
    }

    function menuPosition() {
      const anchor = store.anchor
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const width = Math.min(MENU_WIDTH, viewportWidth - 16)
      const left = anchor ? Math.max(8, Math.min(anchor.left, viewportWidth - width - 8)) : 12
      const top = anchor ? anchor.bottom + 6 : 88
      const maxHeight = Math.max(180, Math.min(480, viewportHeight - top - 12))
      return { left, top, width, maxHeight }
    }

    function ProfileMenu() {
      const state = useStore()
      const panelRef = React.useRef(null)
      const open = state.menuOpen

      React.useEffect(() => {
        if (!open) return
        const panel = panelRef.current
        if (panel) {
          const first = panel.querySelector('[data-dps-row]:not([disabled])')
          if (first && typeof first.focus === 'function') first.focus()
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeMenu()
            return
          }
          if (!panel) return
          const rows = [...panel.querySelectorAll('[data-dps-row]:not([disabled])')]
          if (rows.length === 0) return
          const current = document.activeElement
          const index = rows.indexOf(current)
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            rows[(index + 1 + rows.length) % rows.length].focus()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            rows[(index - 1 + rows.length) % rows.length].focus()
          } else if (event.key === 'Home') {
            event.preventDefault()
            rows[0].focus()
          } else if (event.key === 'End') {
            event.preventDefault()
            rows[rows.length - 1].focus()
          }
        }
        const onPointerDown = (event) => {
          if (panel && panel.contains(event.target)) return
          if (event.target && event.target.closest && event.target.closest('[data-profile-switcher-brand]')) return
          closeMenu()
        }
        document.addEventListener('keydown', onKeyDown, true)
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          document.removeEventListener('pointerdown', onPointerDown, true)
        }
      }, [open])

      if (!open) return null
      const position = menuPosition()
      const homes = state.homes || []
      const canLaunch = state.canLaunch !== false
      const rows = []

      rows.push(h('div', { className: 'dps-menuHead', key: 'head' }, t('title')))
      if (state.menuLoading) rows.push(h('div', { className: 'dps-muted', key: 'loading' }, t('loading')))
      if (state.menuError) {
        rows.push(h('div', { className: 'dps-errorBox', key: 'error' }, h('div', { className: 'dps-error' }, state.menuError)))
      }
      if (!state.menuLoading && homes.every((home) => (home.profiles || []).length === 0)) {
        rows.push(h('div', { className: 'dps-muted', key: 'empty' }, t('empty')))
      }

      for (const home of homes) {
        rows.push(h('div', { className: 'dps-home', key: `home:${home.path}` }, home.label))
        for (const profile of home.profiles || []) {
          rows.push(
            h(
              'button',
              {
                key: `row:${home.path}::${profile.name}`,
                type: 'button',
                role: 'menuitem',
                className: 'dps-item',
                'data-dps-row': '1',
                disabled: profile.current || !canLaunch,
                title: profile.current ? t('currentBadge') : profile.name,
                onClick: () => beginSelect(home.path, profile.name),
              },
              h('span', { className: 'dps-itemName' }, profile.name),
              profile.current
                ? h('span', { className: 'dps-badge' }, t('currentBadge'))
                : profile.state === 'ready'
                  ? h('span', { className: 'dps-itemMeta' }, t('running'))
                  : null,
            ),
          )
        }
      }

      rows.push(h('div', { className: 'dps-menuHint', key: 'hint' }, t('hint')))

      return h(
        'div',
        {
          ref: panelRef,
          className: 'dps-menu',
          role: 'menu',
          style: {
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
            maxHeight: `${position.maxHeight}px`,
          },
        },
        rows,
      )
    }

    function EmbedSurface() {
      const state = useStore()
      const hostRef = React.useRef(null)
      const guestRef = React.useRef(null)
      const [inset, setInset] = React.useState(() => topInset())
      const active = state.phase !== 'idle'

      React.useEffect(() => {
        if (!active) return
        const update = () => setInset(topInset())
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
      }, [active])

      const disposeGuest = React.useCallback(() => {
        const guest = guestRef.current
        guestRef.current = null
        if (!guest) return
        try {
          guest.dispose()
        } catch {
          // Guest already gone.
        }
      }, [])

      React.useEffect(() => {
        if (state.phase !== 'embedded' || !state.url) {
          disposeGuest()
          return undefined
        }
        const bridge = embedBridge()
        if (!bridge) {
          openInTab()
          commit({ phase: 'idle', url: null })
          return undefined
        }
        let cancelled = false
        let element
        let lease
        let disposers = []
        let failTimer
        let loadTimer
        let retryTimer

        const fail = (reason) => {
          if (cancelled) return
          cancelled = true
          if (failTimer !== undefined) clearTimeout(failTimer)
          if (loadTimer !== undefined) clearTimeout(loadTimer)
          if (retryTimer !== undefined) clearTimeout(retryTimer)
          for (const dispose of disposers) dispose()
          disposers = []
          if (element) {
            try {
              element.remove()
            } catch {
              // Already detached.
            }
            element = undefined
          }
          if (lease) {
            try {
              bridge.release(lease)
            } catch {
              // Lease already released.
            }
            lease = undefined
          }
          guestRef.current = null
          commit({ phase: 'error', error: reason, guestLoading: false })
        }

        const on = (target, name, listener) => {
          target.addEventListener(name, listener)
          disposers.push(() => target.removeEventListener(name, listener))
        }

        void (async () => {
          try {
            const reservation = await bridge.acquire(LEASE_WORKSPACE)
            if (cancelled) {
              await bridge.release(reservation.lease).catch(() => {})
              return
            }
            lease = reservation.lease
            const host = hostRef.current
            if (!host) {
              fail(t('embedFailedGeneric'))
              return
            }
            element = document.createElement('webview')
            element.className = 'dps-guestView'
            element.setAttribute('src', `about:blank#${lease}`)
            element.setAttribute('partition', reservation.partition)
            element.setAttribute('name', lease)
            element.setAttribute('allowpopups', '')
            element.setAttribute('data-sidebar-browser-frame', 'webview')
            host.appendChild(element)
            guestRef.current = {
              dispose() {
                cancelled = true
                for (const dispose of disposers) dispose()
                disposers = []
                if (element) element.remove()
                element = undefined
                if (lease) bridge.release(lease).catch(() => {})
                lease = undefined
              },
            }

            const finishLoading = () => {
              if (cancelled) return
              let current = ''
              try {
                current = element.getURL()
              } catch {
                current = ''
              }
              if (!/^https?:/u.test(current)) return
              if (loadTimer !== undefined) clearTimeout(loadTimer)
              if (failTimer !== undefined) clearTimeout(failTimer)
              commit({ guestLoading: false })
              try {
                element.focus()
              } catch {
                // Focus is best effort.
              }
            }
            failTimer = setTimeout(() => fail(t('embedFailedGeneric')), 10_000)
            let targetStarted = false
            on(element, 'dom-ready', () => {
              // dom-ready fires for every document; navigate to the target once.
              if (cancelled || targetStarted) return
              targetStarted = true
              if (failTimer !== undefined) clearTimeout(failTimer)
              loadTimer = setTimeout(() => fail(t('embedFailedGeneric')), 15_000)
              element.loadURL(state.url).catch((error) => {
                if (isAbortedLoad(error)) {
                  retryTimer = setTimeout(() => {
                    if (cancelled || !element) return
                    let current = ''
                    try {
                      current = element.getURL()
                    } catch {
                      current = ''
                    }
                    if (!/^https?:/u.test(current)) {
                      try {
                        // A fresh src navigation avoids the aborted loadURL promise.
                        element.src = state.url
                      } catch {
                        // The timeout reports a genuinely stuck guest.
                      }
                    }
                  }, 600)
                  return
                }
                fail(messageOf(error))
              })
            })
            on(element, 'did-navigate', () => finishLoading())
            on(element, 'did-stop-loading', () => finishLoading())
            on(element, 'did-fail-load', (event) => {
              if (event && event.isMainFrame === false) return
              if (event && event.errorCode === -3) return
              fail(event && event.errorDescription ? String(event.errorDescription) : t('embedFailedGeneric'))
            })
            on(element, 'render-process-gone', () => fail(t('guestGone')))
            on(element, 'destroyed', () => fail(t('guestGone')))
          } catch (failure) {
            fail(messageOf(failure))
          }
        })()

        return () => {
          cancelled = true
          if (failTimer !== undefined) clearTimeout(failTimer)
          if (loadTimer !== undefined) clearTimeout(loadTimer)
          if (retryTimer !== undefined) clearTimeout(retryTimer)
          for (const dispose of disposers) dispose()
          disposers = []
          if (element) element.remove()
          if (lease) bridge.release(lease).catch(() => {})
          guestRef.current = null
        }
      }, [state.phase, state.url, disposeGuest])

      if (!active) return null

      const targetName = state.target ? state.target.name : ''
      const containerStyle = { '--dps-inset': `${inset}px` }
      const platform = document.documentElement.dataset.platform || ''
      const floating = inset <= 0
      const leading = !floating && platform === 'darwin' ? 84 : 12
      const trailing = !floating && platform === 'win32' ? 148 : 12
      const topbarStyle = {
        top: floating ? '8px' : '0px',
        height: floating ? '30px' : `${inset}px`,
        paddingLeft: `${leading}px`,
        paddingRight: `${trailing}px`,
        background: floating ? 'transparent' : 'var(--dsw-alias-bg-base)',
      }
      const children = [
        h(
          'div',
          {
            className: floating ? 'dps-topbar dps-topbarFloat' : 'dps-topbar',
            style: topbarStyle,
            key: 'topbar',
          },
          h(
            'button',
            {
              type: 'button',
              className: floating ? 'dps-back dps-btnFloat' : 'dps-back',
              title: t('embedBack'),
              'aria-label': t('embedBack'),
              onClick: returnToApp,
            },
            h('span', { className: 'dps-backArrow', 'aria-hidden': true }, '←'),
            state.currentName ? h('span', { className: 'dps-backName' }, state.currentName) : null,
          ),
          h('span', { className: 'dps-topbarSpacer', key: 'spacer' }),
          state.url
            ? h(
                'button',
                { type: 'button', className: floating ? 'dps-newTab dps-btnFloat' : 'dps-newTab', onClick: openInTab },
                `${t('embedNewTab')} ↗`,
              )
            : null,
        ),
        h('div', { className: 'dps-guestHost', key: 'guest', ref: hostRef }),
      ]

      if (state.phase === 'starting') {
        children.push(
          h(
            'div',
            { className: 'dps-center', key: 'starting' },
            h(Spinner),
            h('div', { className: 'dps-centerTitle' }, t('embedStarting', { name: targetName })),
            h('div', { className: 'dps-centerHint' }, t('embedCancelHint')),
          ),
        )
      } else if (state.phase === 'error') {
        children.push(
          h(
            'div',
            { className: 'dps-center', key: 'error' },
            h(
              'div',
              { className: 'dps-errorCard' },
              h('div', { className: 'dps-centerTitle' }, t('embedFailed', { name: targetName })),
              h('div', { className: 'dps-errorText' }, state.error),
              h(
                'div',
                { className: 'dps-errorActions' },
                h('button', { type: 'button', className: 'dps-primary', onClick: retryEmbed }, t('retry')),
                state.url ? h('button', { type: 'button', className: 'dps-ghost', onClick: openInTab }, t('embedNewTab')) : null,
                h('button', { type: 'button', className: 'dps-ghost', onClick: returnToApp }, t('embedBack')),
              ),
            ),
          ),
        )
      } else if (state.guestLoading) {
        children.push(
          h(
            'div',
            { className: 'dps-loading', key: 'loading' },
            h(Spinner),
            h('div', { className: 'dps-centerHint' }, t('embedLoading', { name: targetName })),
          ),
        )
      }

      return h('div', { className: 'dps-embed', style: containerStyle }, children)
    }

    const styles = `
.dps-brandWrap{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;overflow:hidden}
.dps-brand{flex:none;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 5px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;-webkit-app-region:no-drag}
.dps-brand:hover,.dps-brandOpen{background:var(--dsw-alias-bg-layer-2)}
.dps-brand:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dps-brandName{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:700;letter-spacing:-.02em;color:var(--dsw-alias-label-primary)}
.dps-brandProfile{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.dps-brandChev{flex:none;font-size:9px;color:var(--dsw-alias-label-secondary);letter-spacing:0}
.dps-menu{position:fixed;z-index:1300;box-sizing:border-box;display:flex;flex-direction:column;gap:1px;padding:6px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 14px 36px rgba(0,0,0,.32);font-size:12.5px;line-height:1.4}
.dps-menuHead{padding:3px 8px 5px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dps-home{margin:6px 8px 2px;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dps-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dps-item:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dps-item:disabled{opacity:.6;cursor:default}
.dps-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dps-itemName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dps-itemMeta{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dps-badge{flex:none;padding:0 7px;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;color:var(--dsw-alias-brand-primary);font-size:10px;font-weight:500}
.dps-menuHint{margin-top:4px;padding:6px 8px 2px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-secondary)}
.dps-muted{padding:6px 8px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dps-errorBox{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px}
.dps-error{flex:1;font-size:11px;color:var(--dsw-alias-state-error-primary);overflow:hidden;text-overflow:ellipsis}
.dps-embed{position:fixed;inset:0;z-index:1500;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.dps-topbar{position:absolute;left:0;right:0;z-index:3;display:flex;align-items:center;gap:8px;box-sizing:border-box;-webkit-app-region:drag;overflow:hidden}
.dps-topbarFloat{background:transparent!important}
.dps-topbarSpacer{flex:1;min-width:8px}
.dps-back,.dps-newTab{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;cursor:pointer;-webkit-app-region:no-drag;white-space:nowrap}
.dps-back:hover,.dps-newTab:hover{background:var(--dsw-alias-bg-layer-2)}
.dps-newTab{color:var(--dsw-alias-label-secondary)}
.dps-btnFloat{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.24)}
.dps-btnFloat:hover{background:var(--dsw-alias-bg-layer-2)}
.dps-backArrow{font-size:12px}
.dps-backName{color:var(--dsw-alias-label-secondary);font-size:11.5px}
.dps-guestHost{position:absolute;top:var(--dps-inset,0px);left:0;right:0;bottom:0;display:flex;background:var(--dsw-alias-bg-base)}
.dps-guestView{width:100%;height:100%;border:0;display:flex}
.dps-center{position:absolute;inset:var(--dps-inset,0px) 0 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--dsw-alias-bg-base);z-index:1}
.dps-centerTitle{font-size:13px;font-weight:600}
.dps-centerHint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dps-errorCard{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:420px;padding:20px 24px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(0,0,0,.28);text-align:center}
.dps-errorText{font-size:11.5px;color:var(--dsw-alias-state-error-primary);max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dps-errorActions{display:flex;gap:8px;margin-top:4px}
.dps-primary{height:28px;padding:0 14px;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.dps-primary:hover{background:var(--dsw-alias-bg-layer-2)}
.dps-ghost{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dps-ghost:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dps-loading{position:absolute;inset:var(--dps-inset,0px) 0 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--dsw-alias-bg-base);z-index:1}
.dps-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dps-spin .9s linear infinite}
@keyframes dps-spin{to{transform:rotate(360deg)}}
`

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        if (ctx.locale && typeof ctx.locale.register === 'function') {
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'profile-switcher: dictionaries')
        }
        if (ctx.locale && typeof ctx.locale.bind === 'function') {
          try {
            translate = ctx.locale.bind(NS)
          } catch {
            // Keep the bundled fallback.
          }
        }
        if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
          const unsubscribe = ctx.locale.subscribe(() => {
            for (const listener of [...store.listeners]) listener()
          })
          ctx.effect(() => () => unsubscribe(), 'profile-switcher: locale subscription')
        }
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-dsh-plugin', NS)
          style.textContent = styles
          document.head.appendChild(style)
          return () => style.remove()
        }, 'profile-switcher: styles')
        ctx.slots.inject(
          'sidebar.brand.name',
          () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -1000001 }, BrandTrigger),
          'profile-switcher: brand trigger',
        )
        ctx.slots.inject(
          'shell.overlay',
          () => ctx.slots.register({ name: 'shell.overlay', id: 'profile-switcher-menu', order: 1300 }, ProfileMenu),
          'profile-switcher: menu',
        )
        ctx.slots.inject(
          'shell.overlay',
          () => ctx.slots.register({ name: 'shell.overlay', id: 'profile-switcher-embed', order: 1400 }, EmbedSurface),
          'profile-switcher: embed surface',
        )
      },
    }
  },
})
