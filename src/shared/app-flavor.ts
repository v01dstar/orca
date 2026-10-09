// Fork (v01dstar/orca): a desktop build made with `ORCA_FLAVOR=instabox` installs beside the
// official Orca on one Mac. Everything two installs would otherwise share — bundle id, app name
// (and so its Safe Storage key), userData, CLI command, URL scheme, home and /tmp state, updates —
// is named here. The Linux .deb for instabox machines is built without it and keeps Orca's names.

declare global {
  // Substituted by electron-vite's main `define` (ORCA_FLAVOR at build time); absent elsewhere.
  const ORCA_APP_FLAVOR: 'instabox' | null | undefined
}

export type AppFlavorId = 'stock' | 'instabox'

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
  /** Shown in About; the instabox app credits the open-source Orca it is built on. */
  aboutCredit: string | null
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
  autoUpdates: true,
  aboutCredit: null
}

const INSTABOX: AppFlavor = {
  id: 'instabox',
  appName: 'Instabox',
  appId: 'com.v01dstar.instabox',
  userDataDirName: 'instabox',
  homeStateDirName: '.instabox-orca',
  cliCommandName: 'instabox-orca',
  urlScheme: 'instabox',
  tmpPrefix: 'instabox',
  // Why: the official feeds would replace this build with the official app.
  autoUpdates: false,
  aboutCredit: 'Built on Orca (github.com/stablyai/orca), open source under the MIT License.'
}

function flavorId(): AppFlavorId {
  // Compiled into the Electron main bundle; the CLI (plain tsc) gets it from its launcher's env.
  const compiled = typeof ORCA_APP_FLAVOR !== 'undefined' ? ORCA_APP_FLAVOR : null
  const value =
    compiled ?? (typeof process !== 'undefined' ? process.env.ORCA_APP_FLAVOR : undefined)
  return value === 'instabox' ? 'instabox' : 'stock'
}

export function getAppFlavor(): AppFlavor {
  return flavorId() === 'instabox' ? INSTABOX : STOCK
}
