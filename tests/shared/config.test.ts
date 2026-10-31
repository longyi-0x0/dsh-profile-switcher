import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/shared/config'

function normalize(raw: unknown): {
  config: ReturnType<typeof normalizeConfig>
  warnings: string[]
} {
  const warnings: string[] = []
  const config = normalizeConfig(raw, (message) => warnings.push(message))
  return { config, warnings }
}

describe('normalizeConfig', () => {
  it('returns the defaults for an absent config', () => {
    const { config, warnings } = normalize(undefined)
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnings).toEqual([])
  })

  it('warns about a non-object config and keeps defaults', () => {
    const { config, warnings } = normalize('nope')
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnings).toHaveLength(1)
  })

  it('applies valid values', () => {
    const { config, warnings } = normalize({
      additionalHomes: ['/srv/.dsh-lab'],
      discoverSiblingHomes: false,
      launcher: 'path',
      dshPath: ' /opt/bin/dsh ',
      windowShell: ' /opt/bin/dsh-profile-window ',
      startTimeoutMs: 30_000,
      idleStopMs: 0,
      maxRunning: 2,
      killGraceMs: 1_000,
      logLevel: 'debug',
    })
    expect(warnings).toEqual([])
    expect(config.additionalHomes).toEqual(['/srv/.dsh-lab'])
    expect(config.discoverSiblingHomes).toBe(false)
    expect(config.launcher).toBe('path')
    expect(config.dshPath).toBe('/opt/bin/dsh')
    expect(config.windowShell).toBe('/opt/bin/dsh-profile-window')
    expect(config.startTimeoutMs).toBe(30_000)
    expect(config.idleStopMs).toBe(0)
    expect(config.maxRunning).toBe(2)
    expect(config.killGraceMs).toBe(1_000)
    expect(config.logLevel).toBe('debug')
  })

  it('warns and falls back for unknown keys and wrong types', () => {
    const { config, warnings } = normalize({
      nope: true,
      additionalHomes: 'not-an-array',
      discoverSiblingHomes: 'yes',
      launcher: 'nope',
      dshPath: 42,
      windowShell: 42,
      logLevel: 'loud',
      startTimeoutMs: 'soon',
    })
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnings.length).toBeGreaterThanOrEqual(6)
  })

  it('filters invalid additional homes and warns once per entry', () => {
    const { config, warnings } = normalize({ additionalHomes: ['', 3, '/ok'] })
    expect(config.additionalHomes).toEqual(['/ok'])
    expect(warnings).toHaveLength(2)
  })

  it('clamps numbers into their ranges', () => {
    const { config, warnings } = normalize({
      startTimeoutMs: 1,
      maxRunning: 99,
      killGraceMs: 1,
      idleStopMs: 1,
    })
    expect(config.startTimeoutMs).toBe(5_000)
    expect(config.maxRunning).toBe(10)
    expect(config.killGraceMs).toBe(100)
    expect(config.idleStopMs).toBe(60_000)
    expect(warnings).toHaveLength(4)
  })

  it('rejects a zero start timeout but accepts disabled idle recovery', () => {
    const { config } = normalize({ idleStopMs: 0, startTimeoutMs: 0 })
    expect(config.idleStopMs).toBe(0)
    expect(config.startTimeoutMs).toBe(5_000)
  })

  it('returns a frozen configuration', () => {
    const { config } = normalize({})
    expect(Object.isFrozen(config)).toBe(true)
  })
})
