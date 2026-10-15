// Fork: Instabox hosts by id, and how removing one is worded. No native imports, so any screen
// can load it.

const HOST_ID_PREFIX = 'instabox-'

export function instaboxHostIdFor(machineId: string): string {
  return `${HOST_ID_PREFIX}${machineId}`
}

export function machineIdOfHost(hostId: string): string | null {
  return hostId.startsWith(HOST_ID_PREFIX) ? hostId.slice(HOST_ID_PREFIX.length) : null
}

/** The remove-host confirm's wording; an Instabox host's removal deletes the machine. */
export function removeHostConfirmCopy(
  hostId: string | undefined,
  name: string | undefined
): { title: string; message: string; confirmLabel: string } {
  return hostId && machineIdOfHost(hostId)
    ? {
        title: 'Delete Machine',
        message: `Delete "${name}"? This deletes the Instabox machine with its disks and every workspace on it. This cannot be undone.`,
        confirmLabel: 'Delete'
      }
    : {
        title: 'Remove Host',
        message: `Remove "${name}"? You can re-pair later.`,
        confirmLabel: 'Remove'
      }
}

/** An Instabox deletion's own reason (e.g. signed out); other hosts keep the caller's text. */
export function removeHostErrorMessage(hostId: string, error: unknown, fallback: string): string {
  return machineIdOfHost(hostId) && error instanceof Error ? error.message : fallback
}
