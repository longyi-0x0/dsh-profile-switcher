import { describe, expect, it } from 'vitest'
import {
  computeTopbarLayout,
  readPlatform,
  readTopInset,
  readWindowsChrome,
} from '../../src/client/insets'

function root(options: {
  fullscreen?: boolean
  platform?: string
  clearance?: string
  windowsChrome?: boolean
}): HTMLElement {
  const element = document.createElement('div')
  if (options.fullscreen === true) element.setAttribute('data-fullscreen', '')
  if (options.platform !== undefined) element.dataset.platform = options.platform
  if (options.windowsChrome === true) element.dataset.windowsTitlebar = ''
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

describe('readWindowsChrome', () => {
  it('reads the Host caption marker', () => {
    expect(readWindowsChrome(root({ windowsChrome: true }))).toBe(true)
    expect(readWindowsChrome(root({ platform: 'win32' }))).toBe(false)
  })
})

describe('computeTopbarLayout', () => {
  it('fills the macOS title strip and clears the traffic lights', () => {
    expect(computeTopbarLayout(48, 'darwin', false)).toEqual({
      floating: false,
      caption: 0,
      height: 48,
      leading: 84,
      trailing: 12,
      content: 48,
    })
  })

  it('puts the bar below the Windows caption instead of over it', () => {
    expect(computeTopbarLayout(40, '', true)).toEqual({
      floating: false,
      caption: 40,
      height: 40,
      leading: 12,
      trailing: 12,
      content: 40,
    })
  })

  it('treats the win32 platform as a caption even without the marker', () => {
    expect(computeTopbarLayout(40, 'win32', false)).toEqual({
      floating: false,
      caption: 40,
      height: 40,
      leading: 12,
      trailing: 12,
      content: 40,
    })
  })

  it('floats the bar when the Host reserves no top area', () => {
    expect(computeTopbarLayout(0, 'linux', false)).toEqual({
      floating: true,
      caption: 0,
      height: 30,
      leading: 12,
      trailing: 12,
      content: 0,
    })
  })
})

describe('readPlatform', () => {
  it('reads the Host platform marker', () => {
    expect(readPlatform(root({ platform: 'darwin' }))).toBe('darwin')
    expect(readPlatform(root({}))).toBe('')
  })
})
