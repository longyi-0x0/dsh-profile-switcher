import { fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CreateProfileDialog } from '../../src/client/ui/CreateProfileDialog'
import { HOME, createTestRuntime, listing } from './helpers'

function openDialog(state: Parameters<typeof createTestRuntime>[0] = {}) {
  const runtime = createTestRuntime({
    ...state,
    state: {
      createOpen: true,
      homes: listing().homes,
      ...state.state,
    },
  })
  const view = runtime.render(<CreateProfileDialog />)
  return { ...runtime, ...view }
}

describe('CreateProfileDialog', () => {
  it('renders nothing while closed', () => {
    const runtime = createTestRuntime()
    const { container } = runtime.render(<CreateProfileDialog />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the target home, focuses the name field, and creates the profile', async () => {
    const runtime = openDialog()
    const dialog = runtime.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(runtime.getByText('New profile in ~/.dsh')).toBeTruthy()
    const input = runtime.getByRole('textbox', { name: 'Profile name' })
    expect(document.activeElement).toBe(input)

    fireEvent.change(input, { target: { value: 'lab' } })
    fireEvent.click(runtime.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(runtime.api.create).toHaveBeenCalledWith(HOME, 'lab'))
    await waitFor(() => expect(runtime.store.getSnapshot().createOpen).toBe(false))
  })

  it('keeps creation disabled for an invalid name', () => {
    const runtime = openDialog()
    const create = runtime.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.change(runtime.getByRole('textbox'), { target: { value: '--bad' } })
    expect(create.disabled).toBe(true)
    fireEvent.change(runtime.getByRole('textbox'), { target: { value: 'lab' } })
    expect(create.disabled).toBe(false)
  })

  it('keeps the dialog and the draft open when creation fails', async () => {
    const runtime = openDialog({
      api: {
        create: async () => {
          throw new Error('boom')
        },
      },
    })
    fireEvent.change(runtime.getByRole('textbox'), { target: { value: 'lab' } })
    fireEvent.click(runtime.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(runtime.getByText(/Request failed/)).toBeTruthy())
    expect(runtime.store.getSnapshot().createOpen).toBe(true)
    expect((runtime.getByRole('textbox') as HTMLInputElement).value).toBe('lab')
  })

  it('closes on Escape, on Cancel, and on a backdrop click', () => {
    const escape = openDialog()
    fireEvent.keyDown(escape.getByRole('dialog'), { key: 'Escape' })
    expect(escape.store.getSnapshot().createOpen).toBe(false)

    const cancel = openDialog()
    fireEvent.click(cancel.getByRole('button', { name: 'Cancel' }))
    expect(cancel.store.getSnapshot().createOpen).toBe(false)

    const backdrop = openDialog()
    fireEvent.pointerDown(backdrop.baseElement.querySelector('.dps-scrim') as Element)
    expect(backdrop.store.getSnapshot().createOpen).toBe(false)
  })

  it('keeps Tab inside the dialog', () => {
    const runtime = openDialog()
    fireEvent.change(runtime.getByRole('textbox'), { target: { value: 'lab' } })
    const dialog = runtime.getByRole('dialog')
    const create = runtime.getByRole('button', { name: 'Create' })
    const cancel = runtime.getByRole('button', { name: 'Cancel' })
    expect(document.activeElement).toBe(runtime.getByRole('textbox'))
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(create)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
  })

  it('shows a localized creation failure from the store', () => {
    const runtime = openDialog({
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
})
