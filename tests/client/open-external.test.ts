import { describe, expect, it, vi } from 'vitest'
import { openExternalUrl, readBrowserBridge } from '../../src/client/open-external'

describe('readBrowserBridge', () => {
  it('requires protocol version 1 and a browser bridge', () => {
    expect(readBrowserBridge()).toBeNull()
    window.dshDesktop = { protocolVersion: 2, browser: { acquire: vi.fn(), release: vi.fn() } }
    expect(readBrowserBridge()).toBeNull()
    window.dshDesktop = { protocolVersion: 1 }
    expect(readBrowserBridge()).toBeNull()
    const browser = { acquire: vi.fn(), release: vi.fn() }
    window.dshDesktop = { protocolVersion: 1, browser }
    expect(readBrowserBridge()).toBe(browser)
    delete window.dshDesktop
  })
})

describe('openExternalUrl', () => {
  it('clears the opener after opening', () => {
    const opened = { opener: {} as unknown } as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    expect(openExternalUrl('http://example.com/')).toBe(true)
    expect(open).toHaveBeenCalledWith('http://example.com/', '_blank')
    expect(opened.opener).toBeNull()
    open.mockRestore()
  })

  it('reports a blocked popup in a plain browser', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openExternalUrl('http://example.com/')).toBe(false)
    open.mockRestore()
  })

  it('treats a null handle as handled when Desktop owns window.open', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    window.dshDesktop = { protocolVersion: 1 }
    expect(openExternalUrl('http://example.com/')).toBe(true)
    delete window.dshDesktop
    open.mockRestore()
  })

  it('reports a throwing window.open as blocked', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(openExternalUrl('http://example.com/')).toBe(false)
    open.mockRestore()
  })
})
