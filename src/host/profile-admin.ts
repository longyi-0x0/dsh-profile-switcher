/**
 * Profile creation and deletion.
 *
 * A profile is a directory under `<home>/profiles` holding three files the Harness
 * reads before it boots: the manifest that names the enabled bundle stack, the user
 * patch layer, and the pnpm settings out-of-tree plugins need. Creating one therefore
 * means writing exactly those files; nothing here imports or evaluates a bundle.
 *
 * Deletion is destructive and irreversible: the directory owns the plugin packages
 * installed into that profile. The policy that keeps it safe (never the running
 * profile, never the app-managed one) lives next to the operations, not in the UI.
 */
import { join } from 'node:path'
import { ApiError } from './errors'
import { sanitizeDetail } from './redact'

/**
 * Bundles a profile created here starts with. `dsh-base` plus `dsh-web-app` is the
 * stack the Desktop shell itself boots, so the new profile can be embedded by the
 * switcher immediately; every bundle resolves from the installation, so the profile
 * needs no package installation to boot.
 */
export const NEW_PROFILE_BUNDLES: readonly string[] = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
]

/**
 * Profile the Electron application owns inside the home it serves. The app rewrites
 * this profile on launch; deleting it would reset the app's own plugin set.
 */
export const RESERVED_PROFILE = 'desktop'

/** The user's patch layer inside a profile directory. */
const PATCH_FILENAME = 'cordis.patch.yml'

/** pnpm settings that keep out-of-tree plugins resolvable from the profile. */
const WORKSPACE_FILENAME = 'pnpm-workspace.yaml'

/** Empty patch list: a profile without its own tweaks is valid and boots. */
const PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries. An empty list applies nothing.
[]

`

/** Hoisted linking keeps a plugin's peers inside the profile. */
const WORKSPACE_TEMPLATE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

/** Filesystem operations a profile mutation needs. */
export interface ProfileAdminDeps {
  exists(path: string): boolean
  /** Create one directory; must fail when the path already exists. */
  mkdir(path: string): void
  /** Write one file; the caller has already established that the directory is new. */
  writeFile(path: string, content: string): void
  /** Remove one directory tree. */
  remove(path: string): void
}

/** @param home - absolute DSH home. @returns its `profiles` directory. */
export function profilesDirectory(home: string): string {
  return join(home, 'profiles')
}

/** @param home - absolute DSH home. @param name - validated profile name. */
export function profileDirectory(home: string, name: string): string {
  return join(profilesDirectory(home), name)
}

/** @param name - validated profile name. @returns the initial manifest text. */
export function newProfileManifest(name: string): string {
  const manifest = {
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...NEW_PROFILE_BUNDLES] } },
  }
  return `${JSON.stringify(manifest, undefined, 2)}\n`
}

/**
 * The app-managed profile of the home this Host serves. Profiles with the same name
 * in other homes are ordinary profiles and stay manageable.
 *
 * @param home - home owning the profile.
 * @param name - profile name.
 * @param currentHome - home the running Host serves.
 */
export function isReservedProfile(home: string, name: string, currentHome: string): boolean {
  return home === currentHome && name === RESERVED_PROFILE
}

/** @param home - home owning the profile. @param name - profile name. */
export function isCurrentProfile(
  home: string,
  name: string,
  currentHome: string,
  currentProfile: string | null,
): boolean {
  return home === currentHome && name === currentProfile
}

/**
 * Whether the menu may offer to delete a profile. A running server does not block a
 * deletion: the router stops it first.
 *
 * @param home - home owning the profile.
 * @param name - profile name.
 * @param currentHome - home the running Host serves.
 * @param currentProfile - profile the running Host serves.
 */
export function canDeleteProfile(
  home: string,
  name: string,
  currentHome: string,
  currentProfile: string | null,
): boolean {
  if (isReservedProfile(home, name, currentHome)) return false
  return !isCurrentProfile(home, name, currentHome, currentProfile)
}

/** @param error - unknown thrown value. @returns its message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Create one profile directory with the Web bundle stack.
 *
 * The manifest is written last: an interrupted creation therefore never looks like a
 * profile to the listing, and the caller's cleanup removes the half-written directory.
 *
 * @param home - home to create the profile in.
 * @param name - validated profile name.
 * @param deps - filesystem seams.
 * @throws {ApiError} `profile-exists` when the directory is taken, `profile-create-failed`
 *   when the files cannot be written.
 */
export function createProfile(home: string, name: string, deps: ProfileAdminDeps): void {
  const directory = profileDirectory(home, name)
  if (deps.exists(directory)) throw new ApiError('profile-exists', 409)
  try {
    deps.mkdir(directory)
  } catch {
    // The directory appeared between the check and the mkdir.
    throw new ApiError('profile-exists', 409)
  }

  try {
    deps.writeFile(join(directory, PATCH_FILENAME), PATCH_TEMPLATE)
    deps.writeFile(join(directory, WORKSPACE_FILENAME), WORKSPACE_TEMPLATE)
    deps.writeFile(join(directory, 'package.json'), newProfileManifest(name))
  } catch (error) {
    try {
      deps.remove(directory)
    } catch {
      // Keep the original failure; a leftover directory is still not a profile
      // without its manifest.
    }
    throw new ApiError('profile-create-failed', 500, sanitizeDetail(errorMessage(error)))
  }
}

/**
 * Delete one profile directory and everything installed into it.
 *
 * @param home - home owning the profile.
 * @param name - validated profile name.
 * @param deps - filesystem seams.
 * @throws {ApiError} `profile-not-found` when the directory is gone, `profile-delete-failed`
 *   when it cannot be removed.
 */
export function deleteProfile(home: string, name: string, deps: ProfileAdminDeps): void {
  const directory = profileDirectory(home, name)
  if (!deps.exists(directory)) throw new ApiError('profile-not-found', 404)
  try {
    deps.remove(directory)
  } catch (error) {
    throw new ApiError('profile-delete-failed', 500, sanitizeDetail(errorMessage(error)))
  }
}
