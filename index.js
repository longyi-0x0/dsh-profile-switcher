/**
 * Host half of dsh-profile-switcher.
 *
 * The Desktop shell boots the hard-wired `desktop` profile, so a profile can only be
 * switched by launching that profile as its own Harness. This plugin lists profiles
 * under the current `$DSH_HOME` and sibling `~/.dsh-*` homes (for example a separate
 * trading stack), starts one on demand through the dsh CLI the Desktop runtime ships,
 * and hands its authenticated URL to the Web UI.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const API = '/api/profile-switcher'
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const WEB_URL_PATTERN = /dsh web:\s+(https?:\/\/\S+)/

export const inject = ['webServer']

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  const webServer = ctx.webServer
  if (!webServer) return
  const logger = ctx.logger ? ctx.logger('profile-switcher') : undefined
  const currentHome = harnessHome()
  const homes = discoverHomes(currentHome)
  const currentProfilesDir = join(currentHome, 'profiles')
  const current = detectCurrentProfile(currentProfilesDir)

  /** @type {Map<string, { home: string, name: string, child: import('node:child_process').ChildProcess | null, url: string | null, error: string | null, stderr: string }>} */
  const running = new Map()
  let cachedLauncher
  let launcherResolved = false

  const launcher = () => {
    if (!launcherResolved) {
      launcherResolved = true
      cachedLauncher = resolveLauncher()
    }
    return cachedLauncher
  }

  const keyOf = (home, name) => `${home}\u0000${name}`

  const knownHome = (candidate) => {
    if (typeof candidate !== 'string' || candidate === '') return undefined
    return homes.find((home) => home === candidate)
  }

  const listProfiles = (home) => {
    const profilesDir = join(home, 'profiles')
    let entries
    try {
      entries = readdirSync(profilesDir, { withFileTypes: true })
    } catch {
      return []
    }
    const result = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const manifestPath = join(profilesDir, entry.name, 'package.json')
      if (!existsSync(manifestPath)) continue
      let bundles = 0
      let updatedAt
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const list = manifest?.dsh?.profile?.bundles
        if (Array.isArray(list)) bundles = list.length
      } catch {
        // A malformed manifest still names a profile directory; report it without bundles.
      }
      try {
        updatedAt = statSync(manifestPath).mtimeMs
      } catch {
        updatedAt = undefined
      }
      const record = running.get(keyOf(home, entry.name))
      result.push({
        name: entry.name,
        current: home === currentHome && entry.name === current,
        bundles,
        updatedAt,
        state: !record ? 'idle' : record.url ? 'ready' : record.error ? 'error' : 'starting',
        url: record && record.url ? record.url : undefined,
        error: record && record.error ? record.error : undefined,
      })
    }
    result.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return result
  }

  const statusFor = (home, name) => {
    const record = running.get(keyOf(home, name))
    if (!record) return { state: 'idle' }
    if (record.url) return { state: 'ready', url: record.url }
    if (record.error) return { state: 'error', error: record.error }
    return { state: 'starting' }
  }

  const ensureStarted = (home, name) => {
    const key = keyOf(home, name)
    const existing = running.get(key)
    if (existing && existing.child) return
    const resolved = launcher()
    const record = { home, name, child: null, url: null, error: null, stderr: '' }
    running.set(key, record)
    if (!resolved) {
      record.error = 'launcher-unavailable'
      return
    }
    let child
    try {
      child = spawn(resolved.command, [...resolved.args, '--profile', name, '--no-open', '--port', '0'], {
        cwd: home,
        env: resolved.env(home),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      record.error = `spawn-failed: ${errorMessage(error)}`
      logger?.warn(`failed to start ${name} in ${home}: ${record.error}`)
      return
    }
    record.child = child
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += chunk
      if (output.length > 64_000) output = output.slice(-8_192)
      const match = output.match(WEB_URL_PATTERN)
      if (match && !record.url) {
        record.url = match[1]
        output = ''
        logger?.info(`${name} (${home}) is serving at ${match[1]}`)
      }
    })
    child.stderr?.on('data', (chunk) => {
      record.stderr = `${record.stderr}${chunk}`.slice(-8_192)
    })
    child.on('error', (error) => {
      record.error = `spawn-failed: ${errorMessage(error)}`
      record.child = null
    })
    child.on('exit', (code, signal) => {
      record.child = null
      record.url = null
      if (!record.error) {
        const tail = record.stderr.trim().split('\n').slice(-4).join('\n')
        const reason = signal ? `signal ${signal}` : `code ${code}`
        record.error = `exited (${reason})${tail ? `: ${tail}` : ''}`
      }
      logger?.warn(`${name} (${home}) stopped: ${record.error}`)
    })
  }

  const stopProfile = (key) => {
    const record = running.get(key)
    if (!record) return
    running.delete(key)
    if (record.child) {
      try {
        record.child.kill('SIGTERM')
      } catch {
        // The process already went away.
      }
    }
  }

  const killAll = () => {
    for (const key of [...running.keys()]) stopProfile(key)
  }

  const homeLabel = (home) => {
    const shown = home.startsWith(homedir()) ? `~${home.slice(homedir().length)}` : home
    return shown
  }

  const state = () => {
    const resolved = launcher()
    return {
      current,
      home: currentHome,
      homes: homes.map((home) => ({
        path: home,
        label: homeLabel(home),
        current: home === currentHome,
        profiles: listProfiles(home),
      })),
      canLaunch: resolved !== undefined,
      launcher: resolved ? { kind: resolved.kind } : undefined,
    }
  }

  const routes = [
    {
      path: `${API}/list`,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, { error: 'method-not-allowed' })
        respond(res, 200, state())
      },
    },
    {
      path: `${API}/open`,
      handler: async (req, res) => {
        if (req.method !== 'POST') return respond(res, 405, { error: 'method-not-allowed' })
        const body = await readJsonBody(req)
        const home = knownHome(body?.home)
        const name = typeof body?.name === 'string' ? body.name : ''
        if (!home) return respond(res, 400, { error: 'unknown-home' })
        if (!NAME_PATTERN.test(name)) return respond(res, 400, { error: 'invalid-profile-name' })
        if (home === currentHome && name === current) return respond(res, 409, { error: 'profile-is-current' })
        if (!listProfiles(home).some((profile) => profile.name === name)) {
          return respond(res, 404, { error: 'profile-not-found' })
        }
        ensureStarted(home, name)
        respond(res, 202, statusFor(home, name))
      },
    },
    {
      path: `${API}/status`,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, { error: 'method-not-allowed' })
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const home = knownHome(url.searchParams.get('home') ?? '')
        const name = url.searchParams.get('name') ?? ''
        if (!home) return respond(res, 400, { error: 'unknown-home' })
        if (!NAME_PATTERN.test(name)) return respond(res, 400, { error: 'invalid-profile-name' })
        respond(res, 200, statusFor(home, name))
      },
    },
    {
      path: `${API}/stop`,
      handler: async (req, res) => {
        if (req.method !== 'POST') return respond(res, 405, { error: 'method-not-allowed' })
        const body = await readJsonBody(req)
        const home = knownHome(body?.home)
        const name = typeof body?.name === 'string' ? body.name : ''
        if (!home) return respond(res, 400, { error: 'unknown-home' })
        if (!NAME_PATTERN.test(name)) return respond(res, 400, { error: 'invalid-profile-name' })
        if (home === currentHome && name === current) return respond(res, 409, { error: 'profile-is-current' })
        stopProfile(keyOf(home, name))
        respond(res, 200, { state: 'idle' })
      },
    },
  ]

  for (const route of routes) {
    ctx.effect(
      () => webServer.register({ kind: 'exact', path: route.path, handler: guard(route.handler, logger) }),
      `profile-switcher: ${route.path}`,
    )
  }

  const onTreeExit = () => killAll()
  process.once('exit', onTreeExit)
  ctx.effect(
    () => () => {
      process.removeListener('exit', onTreeExit)
      killAll()
    },
    'profile-switcher: spawned profile servers',
  )

  logger?.info(`ready; homes: ${homes.map(homeLabel).join(', ')}; launcher: ${launcher()?.kind ?? 'missing'}`)
}

function guard(handler, logger) {
  return async (req, res) => {
    try {
      if (!sameOriginRequest(req)) return respond(res, 403, { error: 'forbidden' })
      if (req.method === 'POST') {
        const type = String(req.headers['content-type'] ?? '').toLowerCase()
        if (!type.startsWith('application/json')) return respond(res, 415, { error: 'unsupported-media-type' })
      }
      await handler(req, res)
    } catch (error) {
      logger?.warn(`request failed: ${errorMessage(error)}`)
      if (!res.headersSent) respond(res, 500, { error: 'internal-error' })
    }
  }
}

/**
 * The Harness Web server mounts plugin routes before its token gate, so this API
 * checks the browser fence itself: a cross-site request never carries a matching
 * Origin, and a JSON body forces a preflight that the server does not answer.
 */
function sameOriginRequest(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  return true
}

/** The Desktop Host receives its profile directory as argv[3] and sets no DSH_PROFILE. */
function detectCurrentProfile(profilesDir) {
  const fromEnv = process.env.DSH_PROFILE
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()
  const fromDirEnv = process.env.DSH_PROFILE_DIR
  if (typeof fromDirEnv === 'string' && fromDirEnv.trim()) {
    return basename(resolve(fromDirEnv.trim()))
  }
  const args = process.argv
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === '--profile') return args[index + 1]
  }
  const projectDir = args[3]
  if (typeof projectDir === 'string' && projectDir !== '') {
    const resolved = resolve(projectDir)
    if (dirname(resolved) === resolve(profilesDir)) return basename(resolved)
  }
  return ''
}

function respond(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function readJsonBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request-body-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text.trim() ? JSON.parse(text) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function harnessHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim()) return resolve(configured.trim())
  return join(homedir(), '.dsh')
}

/**
 * The current home plus sibling homes such as `~/.dsh-trading`. A sibling is only
 * listed when it actually owns a `profiles/` directory, so unrelated dotdirectories
 * never appear.
 */
function discoverHomes(currentHome) {
  const found = []
  const seen = new Set()
  const add = (candidate) => {
    if (typeof candidate !== 'string' || candidate === '') return
    const absolute = resolve(candidate)
    if (seen.has(absolute)) return
    if (!existsSync(join(absolute, 'profiles'))) return
    seen.add(absolute)
    found.push(absolute)
  }
  add(currentHome)
  let entries = []
  try {
    entries = readdirSync(homedir(), { withFileTypes: true })
  } catch {
    entries = []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!/^\.dsh[-_].+/u.test(entry.name)) continue
    add(join(homedir(), entry.name))
  }
  return found.sort((a, b) => (a === currentHome ? -1 : b === currentHome ? 1 : a.localeCompare(b)))
}

/**
 * Resolve how to boot another profile. The Desktop runtime carries the CLI inside its
 * app.asar and runs this Host through Electron's Node mode, so the CLI is spawned with
 * the same binary and `ELECTRON_RUN_AS_NODE`; an npm-installed Harness falls back to
 * the `dsh` executable on PATH.
 */
function resolveLauncher() {
  const electron = process.env.ELECTRON_RUN_AS_NODE === '1'
  const cli = findCli()
  if (electron && cli) {
    return {
      kind: 'desktop-cli',
      command: process.execPath,
      args: ['--expose-internals', cli],
      env: (home) => childEnv(home, true),
    }
  }
  const executable = findOnPath('dsh')
  if (executable) {
    return {
      kind: 'dsh',
      command: executable,
      args: [],
      env: (home) => childEnv(home, false),
    }
  }
  return undefined
}

function findCli() {
  const candidates = []
  const argv1 = process.argv[1] ?? ''
  if (/cli\.js$/u.test(argv1)) candidates.push(argv1)
  if (/\.js$/u.test(argv1)) candidates.push(join(dirname(argv1), 'cli.js'))
  const resources = process.resourcesPath ?? resolve(dirname(process.execPath), '..', 'Resources')
  for (const base of [join(resources, 'app.asar'), join(resources, 'app')]) {
    candidates.push(join(base, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js'))
  }
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}

function findOnPath(command) {
  const path = process.env.PATH
  if (typeof path !== 'string') return undefined
  for (const directory of path.split(process.platform === 'win32' ? ';' : ':')) {
    if (!directory) continue
    const candidate = join(directory, process.platform === 'win32' ? `${command}.cmd` : command)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Keep looking.
    }
  }
  return undefined
}

function childEnv(home, electron) {
  const env = { ...process.env }
  for (const key of ['DSH_PROFILE', 'DSH_PROFILE_DIR', 'DSH_SESSION_ID', 'DSH_WEB_URL', 'DSH_SHELL']) {
    delete env[key]
  }
  env.DSH_HOME = home
  if (electron) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
