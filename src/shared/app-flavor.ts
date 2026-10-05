// Fork (v01dstar/orca): a desktop build made with `ORCA_FLAVOR=hangar` installs beside the
// official Orca on one Mac. Everything two installs would otherwise share — bundle id, app name
// (and so its Safe Storage key), userData, CLI command, URL scheme, home and /tmp state, updates —
// is named here. The Linux .deb for hangar machines is built without it and keeps Orca's names.

declare global {
  // Substituted by electron-vite's main `define` (ORCA_FLAVOR at build time); absent elsewhere.
  const ORCA_APP_FLAVOR: 'hangar' | null | undefined
}

export type AppFlavorId = 'stock' | 'hangar'

export type AppFlavor = {
  id: AppFlavorId
  /** CFBundleName / app.setName; macOS names the Safe Storage keychain item after it. */
  appName: string
  /** macOS bundle id and Windows AppUserModelID. */
  appId: string
  /** Packaged userData leaf under appData (Electron derives it from package.json `name`). */
  userDataDirName: string
  /** Per-user state outside userData, e.g. ~/.orca (encrypted integration credentials). */
  homeStateDirName: string
  /** The CLI command the app installs, and the launcher file inside the bundle. */
  cliCommandName: string
  urlScheme: string
  /** Prefix for sockets and scratch directories under the OS temp dir. */
  tmpPrefix: string
  autoUpdates: boolean
}

const STOCK: AppFlavor = {
  id: 'stock',
  appName: 'Orca',
  appId: 'com.stablyai.orca',
  userDataDirName: 'orca',
  homeStateDirName: '.orca',
  cliCommandName: 'orca',
  urlScheme: 'orca',
  tmpPrefix: 'orca',
  autoUpdates: true
}

const HANGAR: AppFlavor = {
  id: 'hangar',
  appName: 'Orca Hangar',
  appId: 'com.v01dstar.orca-hangar',
  userDataDirName: 'orca-hangar',
  homeStateDirName: '.orca-hangar',
  cliCommandName: 'orca-hangar',
  urlScheme: 'orca-hangar',
  tmpPrefix: 'orca-hangar',
  // Why: the official feeds would replace this build with the official app.
  autoUpdates: false
}

function flavorId(): AppFlavorId {
  // Compiled into the Electron main bundle; the CLI (plain tsc) gets it from its launcher's env.
  const compiled = typeof ORCA_APP_FLAVOR !== 'undefined' ? ORCA_APP_FLAVOR : null
  const value =
    compiled ?? (typeof process !== 'undefined' ? process.env.ORCA_APP_FLAVOR : undefined)
  return value === 'hangar' ? 'hangar' : 'stock'
}

export function getAppFlavor(): AppFlavor {
  return flavorId() === 'hangar' ? HANGAR : STOCK
}
