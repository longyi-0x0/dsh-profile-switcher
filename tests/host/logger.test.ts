import { describe, expect, it, vi } from 'vitest'
import { createScopedLogger } from '../../src/host/logger'

function logger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('createScopedLogger', () => {
  it('drops messages below the configured level', () => {
    const base = logger()
    const scoped = createScopedLogger(base, 'warn')
    scoped.debug('d')
    scoped.info('i')
    scoped.warn('w')
    scoped.error('e')
    expect(base.debug).not.toHaveBeenCalled()
    expect(base.info).not.toHaveBeenCalled()
    expect(base.warn).toHaveBeenCalledWith('w')
    expect(base.error).toHaveBeenCalledWith('e')
  })

  it('forwards everything at debug', () => {
    const base = logger()
    const scoped = createScopedLogger(base, 'debug')
    scoped.debug('d')
    scoped.info('i', { extra: true })
    scoped.warn('w')
    scoped.error('e')
    expect(base.debug).toHaveBeenCalledTimes(1)
    expect(base.info).toHaveBeenCalledWith('i', { extra: true })
    expect(base.warn).toHaveBeenCalledTimes(1)
    expect(base.error).toHaveBeenCalledTimes(1)
  })

  it('only emits errors at error', () => {
    const base = logger()
    const scoped = createScopedLogger(base, 'error')
    scoped.info('i')
    scoped.warn('w')
    scoped.error('e')
    expect(base.info).not.toHaveBeenCalled()
    expect(base.warn).not.toHaveBeenCalled()
    expect(base.error).toHaveBeenCalledWith('e')
  })
})
