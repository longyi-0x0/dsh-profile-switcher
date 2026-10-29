import { describe, expect, it } from 'vitest'
import { computeTopbarLayout, readPlatform, readTopInset } from '../../src/client/insets'

function root(options: {
  fullscreen?: boolean
  platform?: string
  clearance?: string
}): HTMLElement {
  const element = document.createElement('div')
  if (options.fullscreen === true) element.setAttribute('data-fullscreen', '')
  if (options.platform !== undefined) element.dataset.platform = options.platform
  return element
}

function style(clearance: string): (element: Element) => CSSStyleDeclaration {
  return () =>
    ({
      getPropertyValue: (name: string) => (name === '--dsh-frame-top-clearance' ? clearance : ''),
    }) as CSSStyleDeclaration
}

describe('readTopInset', () => {
  it('reserves nothing in fullscreen', () => {
    expect(readTopInset(root({ fullscreen: true, clearance: '38px' }), style('38px'))).toBe(0)
  })

  it('prefers the Host CSS variable', () => {
    expect(readTopInset(root({ platform: 'darwin' }), style('52px'))).toBe(52)
  })

  it('falls back to the platform value', () => {
    expect(readTopInset(root({ platform: 'darwin' }), style(''))).toBe(48)
    expect(readTopInset(root({ platform: 'win32' }), style(''))).toBe(40)
    expect(readTopInset(root({ platform: 'linux' }), style(''))).toBe(0)
  })

  it('ignores an invalid CSS value', () => {
    expect(readTopInset(root({ platform: 'win32' }), style('nope'))).toBe(40)
  })

  it('caps an absurd CSS value', () => {
    expect(readTopInset(root({}), style('9999px'))).toBe(200)
  })
})

describe('computeTopbarLayout', () => {
  it('reserves traffic lights on macOS and titlebar room on Windows', () => {
    expect(computeTopbarLayout(38, 'darwin')).toEqual({
      floating: false,
      leading: 84,
      trailing: 12,
    })
    expect(computeTopbarLayout(40, 'win32')).toEqual({
      floating: false,
      leading: 12,
      trailing: 148,
    })
    expect(computeTopbarLayout(0, 'linux')).toEqual({ floating: true, leading: 12, trailing: 12 })
  })
})

describe('readPlatform', () => {
  it('reads the Host platform marker', () => {
    expect(readPlatform(root({ platform: 'darwin' }))).toBe('darwin')
    expect(readPlatform(root({}))).toBe('')
  })
})
