import { fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmbedSurface } from '../../src/client/ui/EmbedSurface'
import { PROFILE_URL, createTestRuntime } from './helpers'

const TARGET = { home: '/Users/tester/.dsh', name: 'web' }

afterEach(() => {
  delete window.dshDesktop
  vi.restoreAllMocks()
})

describe('EmbedSurface', () => {
  it('renders nothing while idle', () => {
    const runtime = createTestRuntime()
    const { container } = runtime.render(<EmbedSurface />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the starting state and returns to the app', () => {
    const runtime = createTestRuntime({
      state: { phase: 'starting', target: TARGET },
    })
    const view = runtime.render(<EmbedSurface />)
    expect(view.getByText('Starting web…')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: /Back to default/ }))
    expect(runtime.store.getSnapshot().phase).toBe('idle')
    expect(runtime.api.stop).toHaveBeenCalledWith(TARGET.home, TARGET.name)
  })

  it('shows a localized error card and retries', async () => {
    const runtime = createTestRuntime({
      state: {
        phase: 'error',
        target: TARGET,
        url: PROFILE_URL,
        errorCode: 'embed-failed',
        errorDetail: 'boom',
      },
    })
    const view = runtime.render(<EmbedSurface />)
    expect(view.getByText('Could not open web')).toBeTruthy()
    expect(view.getByText('The embedded window failed to open')).toBeTruthy()
    expect(view.getByText('boom')).toBeTruthy()
    const card = view.getByRole('alert')
    fireEvent.click(within(card).getByRole('button', { name: /Open in browser/ }))
    expect(runtime.openExternal).toHaveBeenCalledWith(PROFILE_URL)
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(runtime.api.open).toHaveBeenCalledWith(TARGET.home, TARGET.name, expect.anything()),
    )
  })

  it('mounts a leased guest and clears the loading overlay on load', async () => {
    const bridge = {
      acquire: vi.fn(async () => ({ lease: 'lease-1', partition: 'persist:1' })),
      release: vi.fn(async () => undefined),
    }
    window.dshDesktop = { protocolVersion: 1, browser: bridge }
    const nativeCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = nativeCreateElement(tagName, options)
      if (tagName === 'webview') {
        Object.assign(element, {
          loadURL: vi.fn(async () => undefined),
          getURL: vi.fn(() => 'about:blank'),
        })
      }
      return element
    }) as typeof document.createElement)

    const runtime = createTestRuntime({
      state: {
        phase: 'embedded',
        target: TARGET,
        url: PROFILE_URL,
        guestLoading: true,
      },
    })
    const view = runtime.render(<EmbedSurface />)
    await waitFor(() => expect(bridge.acquire).toHaveBeenCalledWith('profile-switcher'))
    const guest = await waitFor(() => {
      const element = view.container.querySelector('.dps-guestView')
      if (element === null) throw new Error('guest not mounted')
      return element as HTMLElement & {
        loadURL: ReturnType<typeof vi.fn>
        getURL: () => string
      }
    })
    expect(guest.getAttribute('src')).toBe('about:blank#lease-1')
    expect(guest.getAttribute('partition')).toBe('persist:1')
    guest.dispatchEvent(new Event('dom-ready'))
    expect(guest.loadURL).toHaveBeenCalledWith(PROFILE_URL)
    guest.getURL = () => 'http://127.0.0.1:4321/'
    guest.dispatchEvent(new Event('did-stop-loading'))
    await waitFor(() => expect(view.queryByText(/Opening web/)).toBeNull())
    view.unmount()
    await waitFor(() => expect(bridge.release).toHaveBeenCalledWith('lease-1'))
  })

  it('reports a missing bridge as an embed failure', async () => {
    const runtime = createTestRuntime({
      state: {
        phase: 'embedded',
        target: TARGET,
        url: PROFILE_URL,
        guestLoading: true,
      },
    })
    runtime.render(<EmbedSurface />)
    await waitFor(() => expect(runtime.store.getSnapshot().phase).toBe('error'))
  })
})
