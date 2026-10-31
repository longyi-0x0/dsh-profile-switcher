import { describe, expect, it, vi } from 'vitest'
import { openInNewWindow, type ScriptRunner } from '../../src/host/browser-window'

const URL = 'http://127.0.0.1:4321/?token=secret'

interface ScriptResult {
  code: number | null
  stdout?: string
  stderr?: string
}

/** @param results - script results in call order. @returns the runner and the scripts it saw. */
function runner(results: ScriptResult[]) {
  const calls: string[] = []
  const run: ScriptRunner = vi.fn(async (script: string) => {
    calls.push(script)
    const next = results.shift() ?? { code: 0 }
    return { code: next.code, stdout: next.stdout ?? '', stderr: next.stderr ?? '' }
  })
  return { run, calls }
}

describe('openInNewWindow', () => {
  it('is unsupported outside macOS and runs nothing', async () => {
    const { run, calls } = runner([])
    await expect(openInNewWindow(URL, { platform: 'linux', run })).resolves.toEqual({
      opened: false,
      reason: 'unsupported',
    })
    expect(calls).toHaveLength(0)
  })

  it('opens a Safari document for the default browser', async () => {
    const { run, calls } = runner([{ code: 0, stdout: 'Safari.app\n' }, { code: 0 }])
    await expect(openInNewWindow(URL, { platform: 'darwin', run })).resolves.toEqual({
      opened: true,
    })
    expect(calls).toHaveLength(2)
    // Detection never sees the token URL.
    expect(calls[0]).not.toContain('token=')
    expect(calls[1]).toContain('tell application "Safari"')
    expect(calls[1]).toContain('make new document with properties {URL:"')
    expect(calls[1]).toContain(URL)
  })

  it('opens a Chromium window for Chrome-family default browsers', async () => {
    const { run, calls } = runner([{ code: 0, stdout: 'Google Chrome.app\n' }, { code: 0 }])
    await expect(openInNewWindow(URL, { platform: 'darwin', run })).resolves.toEqual({
      opened: true,
    })
    expect(calls[1]).toContain('tell application "Google Chrome"')
    expect(calls[1]).toContain('make new window')
    expect(calls[1]).toContain('set URL of active tab of targetWindow')
    expect(calls[1]).toContain(URL)
  })

  it('reports a default browser without window scripting', async () => {
    const { run, calls } = runner([{ code: 0, stdout: 'Firefox.app\n' }])
    await expect(openInNewWindow(URL, { platform: 'darwin', run })).resolves.toEqual({
      opened: false,
      reason: 'unsupported',
    })
    expect(calls).toHaveLength(1)
  })

  it('reports an unreadable default browser', async () => {
    const { run } = runner([{ code: 1, stderr: 'no LaunchServices' }])
    await expect(openInNewWindow(URL, { platform: 'darwin', run })).resolves.toEqual({
      opened: false,
      reason: 'unsupported',
    })
  })

  it('reports a failed script without leaking the URL', async () => {
    const { run } = runner([
      { code: 0, stdout: 'Safari.app\n' },
      { code: 1, stderr: 'Not authorized to send Apple events (-1743)' },
    ])
    const result = await openInNewWindow(URL, { platform: 'darwin', run })
    expect(result).toEqual({
      opened: false,
      reason: 'failed',
      detail: 'Not authorized to send Apple events (-1743)',
    })
    expect(JSON.stringify(result)).not.toContain('token=')
  })

  it('survives a runner that throws', async () => {
    const run: ScriptRunner = vi.fn(async () => {
      throw new Error('spawn osascript ENOENT')
    })
    await expect(openInNewWindow(URL, { platform: 'darwin', run })).resolves.toEqual({
      opened: false,
      reason: 'unsupported',
    })
  })

  it('escapes quotes so the URL cannot end the script literal', async () => {
    const { run, calls } = runner([{ code: 0, stdout: 'Safari.app\n' }, { code: 0 }])
    await openInNewWindow('http://127.0.0.1:1/?a="b"&c=\\d', { platform: 'darwin', run })
    expect(calls[1]).toContain('\\"b\\"')
    expect(calls[1]).toContain('\\\\d')
  })
})
