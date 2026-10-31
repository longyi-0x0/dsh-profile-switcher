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

/** @param view - rendered menu. @returns the profile-opening rows in order. */
function openRows(view: { container: HTMLElement }): HTMLElement[] {
  return [...view.container.querySelectorAll<HTMLElement>('[data-dps-open="1"]')]
}

describe('ProfileMenu', () => {
  it('renders grouped rows with the current row disabled', () => {
    const view = openMenu()
    expect(view.getByRole('menu').getAttribute('aria-label')).toBe('Switch profile')
    const rows = openRows(view)
    expect(rows).toHaveLength(3)
    const current = rows.find((row) => row.textContent?.includes('desktop'))
    expect((current as HTMLButtonElement).disabled).toBe(true)
    expect(current?.textContent).toContain('Current')
    expect(view.getByText('~/.dsh')).toBeTruthy()
    expect(view.getByText('Running')).toBeTruthy()
  })

  it('focuses the first enabled row and supports roving keys', async () => {
    const view = openMenu()
    const rows = openRows(view)
    const web = rows.find((row) => row.textContent?.includes('web'))
    const deleteWeb = view.getByRole('menuitem', { name: 'Delete web' })
    const trading = rows.find((row) => row.textContent?.includes('trading'))
    if (web === undefined || trading === undefined) throw new Error('missing rows')
    await waitFor(() => expect(document.activeElement).toBe(web))
    const menu = view.getByRole('menu')
    // Row actions take part in the same arrow sequence, so they stay reachable.
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(deleteWeb)
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(trading)
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(web)
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(view.getByRole('menuitem', { name: 'New profile' }))
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
    const row = openRows(runtime).find((item) => item.textContent?.includes('web'))
    if (row === undefined) throw new Error('missing web row')
    fireEvent.click(row)
    expect(runtime.store.getSnapshot()).toMatchObject({
      phase: 'starting',
      target: { home: HOME, name: 'web' },
    })
    expect(runtime.api.open).toHaveBeenCalledWith(HOME, 'web', expect.anything())
  })

  it('hands profile creation to the dialog and closes the menu', () => {
    const runtime = openMenu()
    fireEvent.click(runtime.getByRole('menuitem', { name: 'New profile' }))
    expect(runtime.store.getSnapshot().menuOpen).toBe(false)
    expect(runtime.store.getSnapshot().createOpen).toBe(true)
    expect(runtime.queryByRole('textbox')).toBeNull()
  })

  it('deletes a profile after a second confirmation click', async () => {
    const runtime = openMenu()
    fireEvent.click(runtime.getByRole('menuitem', { name: 'Delete web' }))
    expect(runtime.getByRole('menuitem', { name: 'Confirm deleting web' })).toBeTruthy()
    expect(runtime.api.remove).not.toHaveBeenCalled()
    fireEvent.click(runtime.getByRole('menuitem', { name: 'Confirm deleting web' }))
    await waitFor(() => expect(runtime.api.remove).toHaveBeenCalledWith(HOME, 'web'))
  })

  it('does not offer to delete the running profile', () => {
    const runtime = openMenu()
    expect(runtime.queryByRole('menuitem', { name: 'Delete desktop' })).toBeNull()
    expect(runtime.getByRole('menuitem', { name: 'Delete trading' })).toBeTruthy()
  })

  it('renders a mutation failure', () => {
    const runtime = openMenu({
      state: {
        mutation: {
          kind: 'create',
          name: 'web',
          busy: false,
          error: { code: 'profile-exists' },
        },
      },
    })
    expect(runtime.getByText(/already exists/)).toBeTruthy()
  })

  it('disables every row when launching is unavailable', () => {
    const runtime = createTestRuntime({
      state: { menuOpen: true, anchor: ANCHOR, homes: listing().homes, canLaunch: false },
    })
    const view = runtime.render(<ProfileMenu />)
    for (const row of openRows(view)) {
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
    expect(view.getByText(/Opened in the browser/)).toBeTruthy()
    expect(view.queryByText(/made-up/)).toBeNull()
  })
})
