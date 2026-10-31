/**
 * Open a launch URL in a new browser window.
 *
 * Electron's `shell.openExternal` — which the Desktop shell uses for the app's
 * `window.open` — always hands the URL to the browser's ordinary tab handling, so it
 * cannot produce a window. Only the browser itself can, and on macOS that is AppleScript
 * for the browsers that script windows (`Safari`, Chromium-family).
 *
 * The URL carries the target profile's bearer token, so it travels to `osascript` on
 * *stdin*: an argv form would expose it to every local `ps`. The scripts are fixed text;
 * no request value can become a command.
 */

/** Why a new window could not be opened. */
export type WindowFailure = 'unsupported' | 'failed'

/** Result of asking the system browser for a window. */
export interface WindowResult {
  opened: boolean
  reason?: WindowFailure
  /** Sanitized script failure; never contains the URL. */
  detail?: string
}

/** One AppleScript run; resolves after the process exits. */
export interface ScriptRunner {
  (script: string): Promise<{ code: number | null; stdout: string; stderr: string }>
}

/** Facts the opener reads. */
export interface BrowserWindowDeps {
  platform: NodeJS.Platform
  run: ScriptRunner
}

/** Browsers whose AppleScript dictionary can build a window, by application file name. */
const SCRIPTED_BROWSERS: Readonly<Record<string, 'safari' | 'chromium'>> = {
  'Safari.app': 'safari',
  'Google Chrome.app': 'chromium',
  'Chromium.app': 'chromium',
  'Brave Browser.app': 'chromium',
  'Microsoft Edge.app': 'chromium',
  'Vivaldi.app': 'chromium',
}

/**
 * Resolve the default browser's application file name. A fixed https URL is used so the
 * detection script never sees a token.
 */
const DETECT_SCRIPT = `use framework "AppKit"
set probeURL to current application's NSURL's URLWithString:"https://example.com/"
set appURL to current application's NSWorkspace's sharedWorkspace()'s URLForApplicationToOpenURL:probeURL
if appURL is missing value then return ""
return appURL's lastPathComponent() as text
`

/** @param value - raw AppleScript string body. @returns it escaped for a double-quoted literal. */
function escapeAppleScript(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
}

/** @param app - application name without `.app`. @param url - authenticated URL. */
function safariScript(app: string, url: string): string {
  return `tell application "${app}"
  activate
  make new document with properties {URL:"${escapeAppleScript(url)}"}
end tell
`
}

/** @param app - application name without `.app`. @param url - authenticated URL. */
function chromiumScript(app: string, url: string): string {
  return `tell application "${app}"
  activate
  set targetWindow to make new window
  set URL of active tab of targetWindow to "${escapeAppleScript(url)}"
end tell
`
}

/** @param output - detection stdout. @returns the application file name, or null. */
function detectedApp(output: string): string | null {
  const name = output.trim()
  return name === '' ? null : name
}

/**
 * Ask the default browser for a new window showing `url`.
 *
 * @param url - authenticated launch URL of a ready target.
 * @param deps - platform and script runner.
 * @returns whether a window was requested, or why it was not.
 */
export async function openInNewWindow(url: string, deps: BrowserWindowDeps): Promise<WindowResult> {
  if (deps.platform !== 'darwin') return { opened: false, reason: 'unsupported' }

  const probe = await deps.run(DETECT_SCRIPT).catch(() => null)
  const app = probe === null || probe.code !== 0 ? null : detectedApp(probe.stdout)
  const kind = app === null ? undefined : SCRIPTED_BROWSERS[app]
  if (app === null || kind === undefined) return { opened: false, reason: 'unsupported' }

  const name = app.replace(/\.app$/u, '')
  const script = kind === 'safari' ? safariScript(name, url) : chromiumScript(name, url)
  const result = await deps.run(script).catch((error: unknown) => ({
    code: null,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
  }))
  if (result.code === 0) return { opened: true }
  return { opened: false, reason: 'failed', detail: result.stderr.trim().slice(0, 300) }
}
