#!/usr/bin/env node
/**
 * Validate the published package contract before a release:
 *
 * - manifest metadata required by npm and the DSH bundle loader;
 * - `exports` targets and `files` coverage for every runtime resource;
 * - the bundle patch row, locale display metadata, and icon limits;
 * - the client wrapper id (must equal the package name) and Host exports.
 *
 * Run after `pnpm build`; CI runs it on every change.
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const failures = []

/** @param {boolean} condition @param {string} message */
function check(condition, message) {
  if (!condition) failures.push(message)
}

/** @param {string} relativePath */
async function fileExists(relativePath) {
  try {
    return (await stat(resolve(root, relativePath))).isFile()
  } catch {
    return false
  }
}

// --- manifest metadata -------------------------------------------------------
check(typeof pkg.name === 'string' && pkg.name !== '', 'manifest: name is required')
check(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(pkg.version)),
  'manifest: version is not semver',
)
check(pkg.private !== true, 'manifest: private must be removed before publishing')
check(pkg.license === 'MIT', 'manifest: license must be MIT')
check(pkg.type === 'module', 'manifest: type must be module')
check(typeof pkg.engines?.node === 'string', 'manifest: engines.node is required')
check(
  typeof pkg.repository?.url === 'string' && !pkg.repository.url.includes('<'),
  'manifest: repository.url must be a real URL',
)
check(pkg.publishConfig?.access === 'public', 'manifest: publishConfig.access must be public')
check(await fileExists('LICENSE'), 'files: LICENSE is missing')
check(await fileExists('NOTICE'), 'files: NOTICE is missing')
check(await fileExists('CHANGELOG.md'), 'files: CHANGELOG.md is missing')
check(await fileExists('README.md'), 'files: README.md is missing')
check(await fileExists('README.zh.md'), 'files: README.zh.md is missing')

check(
  Array.isArray(pkg.files) && pkg.files.includes('native-window/bin'),
  'files: native-window/bin must ship with the package',
)

// --- DSH declarations --------------------------------------------------------
check(
  pkg.dsh?.bundle?.patch === './cordis.patch.yml',
  'dsh.bundle.patch must be ./cordis.patch.yml',
)
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be web')
check(pkg.dsh?.client?.immediately === true, 'dsh.client.immediately must be true')
check(
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0,
  'dsh.client.inject must list the ordering dependencies',
)

// --- exports and files -------------------------------------------------------
const expectedExports = {
  '.': './lib/index.js',
  './client': './lib/client.js',
  './icon': './icon.svg',
  './package.json': './package.json',
}
for (const [key, target] of Object.entries(expectedExports)) {
  check(pkg.exports?.[key] === target, `exports["${key}"] must be ${target}`)
}
for (const [key, target] of Object.entries(pkg.exports ?? {})) {
  if (typeof target !== 'string') {
    failures.push(`exports["${key}"] must be a string path`)
    continue
  }
  if (target.includes('*')) continue
  check(await fileExists(target), `exports["${key}"] -> ${target} is missing`)
}

const files = new Set(Array.isArray(pkg.files) ? pkg.files : [])

/**
 * Whether a runtime file is covered by the `files` list (which may contain globs).
 * @param {string} relativePath
 */
function isPublished(relativePath) {
  if (files.has(relativePath)) return true
  return [...files].some((pattern) => {
    if (!pattern.includes('*')) return false
    const escaped = pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
      .join('.*')
    return new RegExp(`^${escaped}$`, 'u').test(relativePath)
  })
}
for (const required of [
  'lib/index.js',
  'lib/client.js',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'README.md',
  'README.zh.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
]) {
  check(isPublished(required), `files: ${required} is not published`)
}
check(!files.has('src'), 'files: source files must not be published')
check(!files.has('lib/.client-body.js'), 'files: the temporary client body must not be published')

// --- bundle patch ------------------------------------------------------------
const patchText = await readFile(resolve(root, pkg.dsh?.bundle?.patch ?? ''), 'utf8')
const patch = parse(patchText)
const rows = (Array.isArray(patch) ? patch : []).flatMap((entry) =>
  Array.isArray(entry?.insert) ? entry.insert : [],
)
check(rows.length === 1, `patch: expected exactly one inserted row, found ${rows.length}`)
const row = rows[0] ?? {}
check(row.name === pkg.name, `patch: row name must be ${pkg.name}`)
check(
  typeof row.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(row.id),
  'patch: row id must be a stable kebab-case id',
)

// --- locale display metadata -------------------------------------------------
for (const locale of ['en', 'zh']) {
  const file = `locale/${locale}.json`
  const json = JSON.parse(await readFile(resolve(root, file), 'utf8'))
  check(
    typeof json.meta?.title === 'string' && json.meta.title !== '',
    `${file}: meta.title is required`,
  )
  check(
    typeof json.meta?.description === 'string' && json.meta.description !== '',
    `${file}: meta.description is required`,
  )
}

// --- icon --------------------------------------------------------------------
const icon = await readFile(resolve(root, 'icon.svg'))
check(icon.byteLength <= 256 * 1024, 'icon: must be at most 256 KiB')
const iconText = icon.toString('utf8').trim()
check(/^<svg[\s>]/i.test(iconText), 'icon: must be an SVG document')
check(!/href\s*=\s*["']https?:/i.test(iconText), 'icon: must not reference external resources')

// --- built artifacts ---------------------------------------------------------
const client = await readFile(resolve(root, 'lib/client.js'), 'utf8')
check(
  client.trimStart().startsWith('/*') || client.trimStart().startsWith('/**'),
  'client: bundle must start with the generated banner',
)
check(client.includes('window.__ModuleLoader__.load('), 'client: missing module loader call')
check(
  client.includes(`id: ${JSON.stringify(pkg.name)}`),
  'client: loader id must equal the package name',
)
const host = await readFile(resolve(root, 'lib/index.js'), 'utf8')
check(
  /export\s*\{[^}]*\bapply\b/.test(host) || /export\s+function\s+apply\b/.test(host),
  'host: apply is not exported',
)
check(
  /export\s*\{[^}]*\binject\b/.test(host) || /export\s+const\s+inject\b/.test(host),
  'host: inject is not exported',
)

if (failures.length > 0) {
  console.error('package check failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`package check passed: ${pkg.name}@${pkg.version}`)
