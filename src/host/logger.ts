import type { HostLogger } from './context'
import type { LogLevel } from '../shared/config'

/** Numeric ordering for log levels. */
const RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Apply the configured minimum level to a named logger.
 *
 * Cordis exposes a named logger but the plugin's `logLevel` is its own contract; this
 * wrapper makes the configuration real for every lifecycle message.
 *
 * @param logger - base named logger.
 * @param minimum - lowest level to emit.
 * @returns a level-filtered logger.
 */
export function createScopedLogger(logger: HostLogger, minimum: LogLevel): HostLogger {
  const threshold = RANK[minimum]
  /** @param level - method level. @param method - bound base method. */
  const at = (level: LogLevel, method: (message: string, ...args: unknown[]) => void) => {
    return (message: string, ...args: unknown[]): void => {
      if (RANK[level] < threshold) return
      method(message, ...args)
    }
  }
  return {
    debug: at('debug', (message, ...args) => logger.debug(message, ...args)),
    info: at('info', (message, ...args) => logger.info(message, ...args)),
    warn: at('warn', (message, ...args) => logger.warn(message, ...args)),
    error: at('error', (message, ...args) => logger.error(message, ...args)),
  }
}
