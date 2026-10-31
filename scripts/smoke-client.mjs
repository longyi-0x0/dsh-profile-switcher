#!/usr/bin/env node
/**
 * Artifact-level smoke test. It loads the built client bundle in a `node:vm`
 * sandbox exactly as the browser's module loader would, then runs `apply` against
 * a minimal slot/locale/effect context and asserts the registration contract.
 *
 * This is deliberately independent of the TypeScript sources: it verifies what the
 * package actually ships, including the injected loader id and the module requests.
 * The Host artifact is imported as ESM and checked for its export surface.
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)
const React = require('react')
const jsxRuntime = require('react/jsx-runtime')

/** @param {string} message */
function fail(message) {
  throw new Error(`smoke: ${message}`)
}

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) fail(message)
}

// --- client bundle -----------------------------------------------------------
/** @type {{ id?: string, factory?: (require: (name: string) => unknown) => unknown } | null} */
let definition = null
const styleElement = {
  textContent: '',
  setAttribute() {},
  remove() {},
}
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  queueMicrotask,
  navigator: { language: 'en-US' },
  document: {
    createElement: () => styleElement,
    head: { appendChild() {} },
  },
  window: {
    __ModuleLoader__: {
      load(/** @type {typeof definition} */ next) {
        if (definition !== null) fail('the loader was called more than once')
        definition = next
      },
    },
  },
}
vm.createContext(sandbox)
vm.runInContext(await readFile(resolve(root, 'lib/client.js'), 'utf8'), sandbox, {
  filename: 'lib/client.js',
})

assert(definition !== null, 'the client bundle did not call window.__ModuleLoader__.load')
const loaded = /** @type {NonNullable<typeof definition>} */ (definition)
assert(loaded.id === pkg.name, `loader id ${String(loaded.id)} must equal package name ${pkg.name}`)
assert(typeof loaded.factory === 'function', 'the loader definition has no factory')

const requested = []
const module = loaded.factory((name) => {
  requested.push(name)
  if (name === 'react') return React
  if (name === 'react/jsx-runtime') return jsxRuntime
  fail(`unexpected module request ${JSON.stringify(name)}`)
})
assert(module && typeof module === 'object', 'the factory must return the plugin module')
const plugin = /** @type {{ inject?: unknown, apply?: unknown }} */ (module)
assert(Array.isArray(plugin.inject), 'the client half must declare inject')
assert(plugin.inject.includes('slots'), 'the client half must inject slots')
assert(plugin.inject.includes('locale'), 'the client half must inject locale')
assert(typeof plugin.apply === 'function', 'the client half must export apply')

const registrations = []
const dictionaries = []
const effects = []
const ctx = {
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  slots: {
    inject(name, callback, label) {
      registrations.push({ kind: 'inject', name, label })
      return callback()
    },
    register(options, component) {
      const entry = { kind: 'register', options, component, disposed: false }
      registrations.push(entry)
      return () => {
        entry.disposed = true
      }
    },
  },
  locale: {
    register(namespace, locales) {
      dictionaries.push({ namespace, locales })
      return () => {}
    },
  },
  effect(callback, label) {
    effects.push(label)
    const dispose = callback()
    if (typeof dispose === 'function') dispose()
  },
}

const applyPlugin = /** @type {(ctx: unknown) => void} */ (plugin.apply)
applyPlugin(ctx)

assert(dictionaries.length === 1, `expected one dictionary set, got ${dictionaries.length}`)
assert(dictionaries[0].namespace === 'profile-switcher', 'unexpected locale namespace')
assert(dictionaries[0].locales.zh && dictionaries[0].locales.en, 'both zh and en are required')

const registered = registrations.filter((entry) => entry.kind === 'register')
assert(registered.length === 4, `expected 4 slot registrations, got ${registered.length}`)
const names = registered.map((entry) => entry.options.name).sort()
assert(
  JSON.stringify(names) ===
    JSON.stringify(['shell.overlay', 'shell.overlay', 'shell.overlay', 'sidebar.brand.name']),
  `unexpected slot names: ${names.join(', ')}`,
)
for (const entry of registered) {
  assert(typeof entry.component === 'function', `slot ${entry.options.name} has no component`)
  assert(
    entry.options.locale === 'profile-switcher',
    `slot ${entry.options.name} must bind its locale`,
  )
}
assert(
  registered
    .filter((entry) => entry.options.name === 'shell.overlay')
    .every((entry) => entry.options.id),
  'shell.overlay registrations need distinct ids',
)
assert(effects.length >= 2, 'expected style and locale effects')
assert(
  requested.every((name) => name === 'react' || name === 'react/jsx-runtime'),
  `unexpected module requests: ${requested.join(', ')}`,
)

// --- host bundle -------------------------------------------------------------
const host = await import(pathToFileURL(resolve(root, 'lib/index.js')).href)
assert(typeof host.apply === 'function', 'host: apply is not exported')
assert(Array.isArray(host.inject), 'host: inject is not an array')
assert(
  host.inject.includes('connection'),
  'host: inject must require the authenticated connection service',
)

console.log(`smoke passed: ${pkg.name}@${pkg.version}`)
console.log(`client: ${registered.length} slots, ${requested.join('+') || 'no'} module requests`)
console.log(`host: inject = ${host.inject.join(', ')}`)
