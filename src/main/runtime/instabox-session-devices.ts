import type { DeviceScope } from '../../shared/runtime-types'
import { mintDeviceCredential } from './device-credential'
import type { DeviceEntry, TokenDeviceEntry } from './device-entry'

// Why: instabox sessions end without telling the runtime, so their rows age out instead.
const INSTABOX_DEVICE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** One token row per instabox session and scope, so a client's many sockets share one device. */
export function planInstaboxSessionDevice(
  devices: readonly DeviceEntry[],
  sessionId: string,
  scope: DeviceScope,
  now: number
): { entry: TokenDeviceEntry; nextDevices: DeviceEntry[] | null } {
  const existing = devices.find(
    (d): d is TokenDeviceEntry =>
      d.hangarSessionId === sessionId && d.scope === scope && d.token !== undefined
  )
  if (existing) {
    return { entry: existing, nextDevices: null }
  }
  const cutoff = now - INSTABOX_DEVICE_RETENTION_MS
  const entry: TokenDeviceEntry = {
    ...mintDeviceCredential(),
    name: scope === 'mobile' ? 'instabox mobile session' : 'instabox desktop session',
    scope,
    pairedAt: now,
    // Why: authenticated as it is created; zero would mark an unscanned pairing offer.
    lastSeenAt: now,
    pairingReach: 'network',
    hangarSessionId: sessionId
  }
  const retained = devices.filter((d) => !d.hangarSessionId || d.lastSeenAt >= cutoff)
  return { entry, nextDevices: [...retained, entry] }
}
