import { fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandTrigger } from '../../src/client/ui/BrandTrigger'
import { createTestRuntime } from './helpers'

describe('BrandTrigger', () => {
  it('renders the official wordmark and the active profile', () => {
    const runtime = createTestRuntime({ state: { currentName: 'desktop' } })
    const { getByRole, container } = runtime.render(<BrandTrigger />)
    const button = getByRole('button', { name: 'Switch profile: desktop' })
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('data-profile-switcher-brand')).toBe('1')
    expect(button.textContent).toContain('desktop')
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('falls back to a generic label when the profile is unknown', () => {
    const runtime = createTestRuntime()
    const { getByRole } = runtime.render(<BrandTrigger />)
    expect(getByRole('button', { name: 'Switch profile: profile' })).toBeTruthy()
  })

  it('opens and closes the menu', () => {
    const runtime = createTestRuntime({ state: { currentName: 'desktop' } })
    const { getByRole } = runtime.render(<BrandTrigger />)
    const button = getByRole('button')
    fireEvent.click(button)
    expect(runtime.store.getSnapshot().menuOpen).toBe(true)
    expect(runtime.api.list).toHaveBeenCalled()
    fireEvent.click(button)
    expect(runtime.store.getSnapshot().menuOpen).toBe(false)
  })

  it('opens from the keyboard', () => {
    const runtime = createTestRuntime()
    const { getByRole } = runtime.render(<BrandTrigger />)
    const button = getByRole('button')
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(runtime.store.getSnapshot().menuOpen).toBe(true)
  })

  it('announces the browser fallback', () => {
    const runtime = createTestRuntime({ state: { notice: 'web-fallback' } })
    const { getByRole } = runtime.render(<BrandTrigger />)
    expect(getByRole('status').textContent).toContain('browser')
  })
})
