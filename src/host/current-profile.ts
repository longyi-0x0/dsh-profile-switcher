import { basename, dirname, resolve } from 'node:path'
import { PROFILE_NAME_PATTERN } from '../shared/protocol'

/** Environment and process facts the detection reads. */
export interface CurrentProfileDeps {
  env: Readonly<Record<string, string | undefined>>
  argv: readonly string[]
  profilesDir: string
}

/** @param value - candidate profile name. @returns the trimmed name when valid. */
function validName(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return PROFILE_NAME_PATTERN.test(trimmed) ? trimmed : null
}

/**
 * Detect the profile whose Host is running this plugin.
 *
 * The Desktop shell boots a hard-wired `desktop` profile and different launchers
 * expose the profile in different ways, so this checks, in order:
 *
 * 1. `DSH_PROFILE` (set by profile-launched Harness shells);
 * 2. the basename of `DSH_PROFILE_DIR`;
 * 3. a `--profile <name>` argument;
 * 4. `argv[3]`, which is the profile directory when the Desktop Host is launched.
 *
 * @param deps - environment, arguments, and the current profiles directory.
 * @returns the profile name, or null when detection fails.
 */
export function detectCurrentProfile(deps: CurrentProfileDeps): string | null {
  const fromEnv = validName(deps.env.DSH_PROFILE)
  if (fromEnv !== null) return fromEnv

  const profileDir = deps.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.trim() !== '') {
    const fromDir = validName(basename(resolve(profileDir.trim())))
    if (fromDir !== null) return fromDir
  }

  const args = deps.argv
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] !== '--profile') continue
    const fromFlag = validName(args[index + 1])
    if (fromFlag !== null) return fromFlag
  }

  const projectDir = args[3]
  if (typeof projectDir === 'string' && projectDir !== '') {
    const resolved = resolve(projectDir)
    if (dirname(resolved) === resolve(deps.profilesDir)) {
      return validName(basename(resolved))
    }
  }
  return null
}
