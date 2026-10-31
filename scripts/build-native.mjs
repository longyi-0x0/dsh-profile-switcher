#!/usr/bin/env node
/**
 * Build the native window host and copy it into the package.
 *
 * The plugin ships the binary for the current platform under `native-window/bin/`, so a
 * GitHub or npm install brings the host along with the JavaScript. This script rebuilds it
 * from `native-window/` and writes it where `src/host/window-shell.ts` looks.
 *
 * Run it on each platform you want to publish; the committed binary is what users get.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const crate = join(root, 'native-window')
const executable = process.platform === 'win32' ? 'dsh-profile-window.exe' : 'dsh-profile-window'
const platform = `${process.platform}-${process.arch}`
const target = join(crate, 'bin', platform, executable)

execFileSync('cargo', ['build', '--release', '--manifest-path', join(crate, 'Cargo.toml')], {
  stdio: 'inherit',
})

mkdirSync(dirname(target), { recursive: true })
copyFileSync(join(crate, 'target', 'release', executable), target)
if (process.platform !== 'win32') chmodSync(target, 0o755)
console.log(`native window host: ${target}`)
