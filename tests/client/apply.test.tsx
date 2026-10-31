import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/client/apply'
import type { ComponentType } from 'react'
import type { ClientContext, SlotRegistrationOptions, SlotProps } from '../../src/client/context'
import { API_PREFIX } from '../../src/shared/protocol'
import { listing } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

interface Registration {
  options: SlotRegistrationOptions
  component: ComponentType<SlotProps>
}

/** Mount the real client plugin against a captured context. */
function mount(): { request: ReturnType<typeof vi.fn>; registrations: Registration[] } {
  const request = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(listing()),
  }))
  vi.stubGlobal('fetch', request)
  const registrations: Registration[] = []
  const ctx: ClientContext = {
    slots: {
      inject(_name, callback) {
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => undefined
      },
    },
    locale: {
      register() {
        return () => undefined
      },
    },
    effect(callback) {
      return callback()
    },
  }
  apply(ctx)
  return { request, registrations }
}

describe('client apply', () => {
  it('reads the listing at startup so the brand trigger knows the profile', async () => {
    const { request, registrations } = mount()
    const brand = registrations.find((entry) => entry.options.name === 'sidebar.brand.name')
    if (brand === undefined) throw new Error('brand slot was not registered')

    const view = render(<brand.component />)
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Switch profile: desktop' })).toBeTruthy(),
    )
    expect(request).toHaveBeenCalledWith(`${API_PREFIX}/list`, expect.anything())
    // The name arrives without the menu ever being opened.
    expect(view.queryByRole('menu')).toBeNull()
  })
})
