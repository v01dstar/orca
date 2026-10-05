import { getAppFlavor } from '../../shared/app-flavor'

// Fork flavor: its own command, so neither app reclaims the other's /usr/local/bin entry.
export const DEFAULT_MAC_COMMAND_PATH = `/usr/local/bin/${getAppFlavor().cliCommandName}`
export const DEV_COMMAND_NAME = 'orca-dev'
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000
