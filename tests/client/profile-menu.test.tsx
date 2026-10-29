import { fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProfileMenu } from '../../src/client/ui/ProfileMenu'
import { HOME, createTestRuntime, listing } from './helpers'

const ANCHOR = { left: 10, top: 10, bottom: 34 }

function openMenu(state: Parameters<typeof createTestRuntime>[0] = {}) {
  const runtime = createTestRuntime({
    ...state,
    state: {
      menuOpen: true,
      anchor: ANCHOR,
      homes: listing().homes,
      ...state.state,
    },
  })
  const view = runtime.render(<ProfileMenu />)
  return { ...runtime, ...view }
}

describe('ProfileMenu', () => {
  it('renders grouped rows with the current row disabled', () => {
    const { getByRole, getAllByRole, getByText } = openMenu()
    expect(getByRole('menu').getAttribute('aria-label')).toBe('Switch profile')
    const rows = getAllByRole('menuitem')
    expect(rows).toHaveLength(3)
    const current = rows.find((row) => row.textContent?.includes('desktop'))
    expect((current as HTMLButtonElement).disabled).toBe(true)
    expect(current?.textContent).toContain('Current')
    expect(getByText('~/.dsh')).toBeTruthy()
    expect(getByText('Running')).toBeTruthy()
  })

  it('focuses the first enabled row and supports roving keys', async () => {
    const { getByRole, getAllByRole } = openMenu()
    const rows = getAllByRole('menuitem')
    const web = rows.find((row) => row.textContent?.includes('web'))
    const trading = rows.find((row) => row.textContent?.includes('trading'))
    if (web === undefined || trading === undefined) throw new Error('missing rows')
    await waitFor(() => expect(document.activeElement).toBe(web))
    const menu = getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(trading)
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(web)
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(trading)
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(web)
  })

  it('closes on Escape and restores focus to the trigger', () => {
    const runtime = openMenu()
    fireEvent.keyDown(runtime.getByRole('menu'), { key: 'Escape' })
    expect(runtime.store.getSnapshot().menuOpen).toBe(false)
    expect(runtime.focusTrigger).toHaveBeenCalled()
  })

  it('closes on Tab and restores focus to the trigger', () => {
    const runtime = openMenu()
    fireEvent.keyDown(runtime.getByRole('menu'), { key: 'Tab' })
    expect(runtime.store.getSnapshot().menuOpen).toBe(false)
    expect(runtime.focusTrigger).toHaveBeenCalled()
  })

  it('closes on an outside pointer press without stealing focus', () => {
    const runtime = openMenu()
    fireEvent.pointerDown(document.body)
    expect(runtime.store.getSnapshot().menuOpen).toBe(false)
    expect(runtime.focusTrigger).not.toHaveBeenCalled()
  })

  it('selects a profile', () => {
    const runtime = openMenu()
    const row = runtime.getAllByRole('menuitem').find((item) => item.textContent?.includes('web'))
    if (row === undefined) throw new Error('missing web row')
    fireEvent.click(row)
    expect(runtime.store.getSnapshot()).toMatchObject({
      phase: 'starting',
      target: { home: HOME, name: 'web' },
    })
    expect(runtime.api.open).toHaveBeenCalledWith(HOME, 'web', expect.anything())
  })

  it('disables every row when launching is unavailable', () => {
    const runtime = createTestRuntime({
      state: { menuOpen: true, anchor: ANCHOR, homes: listing().homes, canLaunch: false },
    })
    const view = runtime.render(<ProfileMenu />)
    for (const row of view.getAllByRole('menuitem')) {
      expect((row as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('shows the loading and empty states', () => {
    const loading = createTestRuntime({
      state: { menuOpen: true, anchor: ANCHOR, menuLoading: true, homes: null },
    })
    expect(loading.render(<ProfileMenu />).getByText('Reading profiles…')).toBeTruthy()
  })

  it('shows an empty state when every home has no profiles', async () => {
    const empty = createTestRuntime({
      state: {
        menuOpen: true,
        anchor: ANCHOR,
        homes: [{ path: HOME, label: '~/.dsh', current: true, profiles: [] }],
      },
    })
    const view = empty.render(<ProfileMenu />)
    await waitFor(() => expect(view.getByText('No other profiles found')).toBeTruthy())
  })

  it('renders a localized list error and retries', () => {
    const runtime = createTestRuntime({
      state: {
        menuOpen: true,
        anchor: ANCHOR,
        menuError: { code: 'unsupported-host' },
      },
    })
    const view = runtime.render(<ProfileMenu />)
    expect(view.getByText(/does not support the plugin/)).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Retry' }))
    expect(runtime.api.list).toHaveBeenCalled()
  })

  it('renders diagnostics and the fallback notice', () => {
    const runtime = createTestRuntime({
      state: {
        menuOpen: true,
        anchor: ANCHOR,
        homes: listing().homes,
        diagnostics: [{ code: 'launcher-missing' }, { code: 'made-up' }],
        notice: 'web-fallback',
      },
    })
    const view = runtime.render(<ProfileMenu />)
    expect(view.getByText(/No dsh launcher found/)).toBeTruthy()
    expect(view.getByText(/Opened in a new tab/)).toBeTruthy()
    expect(view.queryByText(/made-up/)).toBeNull()
  })
})
