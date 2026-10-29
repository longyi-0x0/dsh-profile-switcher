import { join } from 'node:path'
import { PROFILE_NAME_PATTERN } from '../shared/protocol'

/** Filesystem entry shape shared by `node:fs` Dirent and test doubles. */
export interface ProfileDirectoryEntry {
  name: string
  isDirectory(): boolean
}

/** Injected filesystem access for profile discovery. */
export interface ProfileListDeps {
  readdir(path: string): readonly ProfileDirectoryEntry[]
  exists(path: string): boolean
  readFile(path: string): string
  mtime(path: string): number | undefined
}

/** One profile directory as discovered from disk. */
export interface ListedProfile {
  name: string
  bundles: number
  updatedAt?: number
}

/** @param value - parsed manifest candidate. @returns the declared bundle count. */
function bundleCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0
  const dsh = (value as { dsh?: unknown }).dsh
  if (typeof dsh !== 'object' || dsh === null) return 0
  const profile = (dsh as { profile?: unknown }).profile
  if (typeof profile !== 'object' || profile === null) return 0
  const bundles = (profile as { bundles?: unknown }).bundles
  return Array.isArray(bundles) ? bundles.length : 0
}

/**
 * List the profile directories under one home.
 *
 * A directory is a profile only when it owns a `package.json`. Names that cannot be
 * passed through the API (spaces, leading dashes, non-ASCII) are skipped: the
 * switcher could never launch them, so showing them would only be confusing.
 * A malformed manifest still names a usable profile, so it is listed with zero
 * bundles instead of disappearing.
 *
 * @param profilesDir - `<home>/profiles`.
 * @param deps - filesystem seams.
 * @returns profiles sorted by name.
 */
export function listProfileDirectories(
  profilesDir: string,
  deps: ProfileListDeps,
): ListedProfile[] {
  let entries: readonly ProfileDirectoryEntry[]
  try {
    entries = deps.readdir(profilesDir)
  } catch {
    return []
  }

  const profiles: ListedProfile[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (!PROFILE_NAME_PATTERN.test(entry.name)) continue
    const manifestPath = join(profilesDir, entry.name, 'package.json')
    if (!deps.exists(manifestPath)) continue

    let bundles = 0
    try {
      bundles = bundleCount(JSON.parse(deps.readFile(manifestPath)))
    } catch {
      bundles = 0
    }

    const updatedAt = deps.mtime(manifestPath)
    if (updatedAt === undefined) {
      profiles.push({ name: entry.name, bundles })
    } else {
      profiles.push({ name: entry.name, bundles, updatedAt })
    }
  }

  return profiles.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
