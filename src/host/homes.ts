import { join, resolve, sep } from 'node:path'

/** Filesystem entry shape shared by `node:fs` Dirent and test doubles. */
export interface DirectoryEntry {
  name: string
  isDirectory(): boolean
}

/** Injected filesystem access, so home discovery is testable without temp dirs. */
export interface HomeDiscoveryDeps {
  homeDir: string
  currentHome: string
  additionalHomes?: readonly string[]
  discoverSiblingHomes?: boolean
  exists(path: string): boolean
  readdir(path: string): readonly DirectoryEntry[]
}

/** Code-point comparison, so listing order does not depend on the machine locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** A sibling home whose name starts with `.dsh-` or `.dsh_`. */
const SIBLING_HOME_PATTERN = /^\.dsh[-_].+/u

/**
 * List the DSH homes the switcher may offer.
 *
 * A home is included only when it owns a `profiles/` directory, so unrelated
 * dot-directories never appear. The current home sorts first, then every other home
 * by path; duplicates are removed by resolved path.
 *
 * @param deps - environment and filesystem seams.
 * @returns resolved absolute home paths.
 */
export function discoverHomes(deps: HomeDiscoveryDeps): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  const add = (candidate: string): void => {
    const absolute = resolve(candidate)
    if (seen.has(absolute)) return
    if (!deps.exists(join(absolute, 'profiles'))) return
    seen.add(absolute)
    found.push(absolute)
  }

  add(deps.currentHome)
  for (const home of deps.additionalHomes ?? []) add(home)

  if (deps.discoverSiblingHomes !== false) {
    let entries: readonly DirectoryEntry[] = []
    try {
      entries = deps.readdir(deps.homeDir)
    } catch {
      entries = []
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!SIBLING_HOME_PATTERN.test(entry.name)) continue
      add(join(deps.homeDir, entry.name))
    }
  }

  return found.sort((a, b) => {
    if (a === deps.currentHome) return -1
    if (b === deps.currentHome) return 1
    return compareText(a, b)
  })
}

/**
 * Shorten a home path for display, using `~` for the user's home directory.
 * @param home - absolute home path.
 * @param homeDir - user's home directory.
 * @returns display label.
 */
export function homeLabel(home: string, homeDir: string): string {
  if (home === homeDir) return '~'
  const prefix = homeDir.endsWith(sep) ? homeDir : `${homeDir}${sep}`
  return home.startsWith(prefix) ? `~${home.slice(homeDir.length)}` : home
}
