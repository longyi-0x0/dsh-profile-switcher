import { spawn } from 'node:child_process'
import type { ScriptRunner } from './browser-window'

/** A browser that never answers must not pin the request open. */
const SCRIPT_TIMEOUT_MS = 10_000

/**
 * Run AppleScript with the script on stdin.
 *
 * The script carries the launch URL, and stdin keeps it out of `ps`. A timeout bounds a
 * browser that shows an automation prompt and never answers.
 *
 * @returns a runner for {@link openInNewWindow}.
 */
export function createOsascriptRunner(): ScriptRunner {
  return (script) =>
    new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const deadline: { timer?: NodeJS.Timeout } = {}

      // Absolute path: the Host's PATH is the app's, not a login shell's.
      const child = spawn('/usr/bin/osascript', ['-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const finish = (code: number | null, failure?: string): void => {
        if (settled) return
        settled = true
        if (deadline.timer !== undefined) clearTimeout(deadline.timer)
        resolve({ code, stdout, stderr: failure ?? stderr })
      }

      deadline.timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(null, 'osascript did not finish in time')
      }, SCRIPT_TIMEOUT_MS)
      deadline.timer.unref?.()

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.on('error', (error) => finish(null, error.message))
      child.on('close', (code) => finish(code))
      child.stdin?.end(script)
    })
}
