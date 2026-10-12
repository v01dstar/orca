import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'
import type { ClassifiedE2EEAuth } from './mobile-e2ee-auth-validation'
import type { DeviceEntry, DeviceRegistry } from '../device-registry'
import { InstaboxDeviceRegistry } from '../instabox-session-devices'
import { authenticateInstaboxAssertion } from './instabox-assertion-auth'

const V2_ASSERTION_KEYS = 'hangarAssertion,transcriptHashB64,type,v'

/** e2ee_auth carrying an instabox assertion (wire name predates the rename) instead of a device credential. */
export function classifyInstaboxAssertionAuth(
  auth: Record<string, unknown>,
  v2Session: DesktopMobileE2EEV2Session | null
): ClassifiedE2EEAuth {
  const assertion = auth.hangarAssertion
  if (typeof assertion !== 'string' || !assertion) {
    return { kind: 'invalid' }
  }
  if (!v2Session) {
    return auth.v === undefined &&
      auth.transcriptHashB64 === undefined &&
      auth.deviceToken === undefined &&
      auth.deviceId === undefined &&
      auth.deviceProofB64 === undefined
      ? { kind: 'assertion', assertion, clientCapabilities: auth.clientCapabilities }
      : { kind: 'invalid' }
  }
  return Object.keys(auth).sort().join(',') === V2_ASSERTION_KEYS &&
    auth.v === 2 &&
    auth.transcriptHashB64 === v2Session.transcriptHashB64
    ? { kind: 'assertion', assertion }
    : { kind: 'invalid' }
}

/** The registry row for a verified assertion's session, or null to refuse the client. */
export function resolveInstaboxSessionDevice(
  registry: DeviceRegistry,
  trustedIssuerFile: string,
  assertion: string
): DeviceEntry | null {
  const claims = authenticateInstaboxAssertion(assertion, trustedIssuerFile)
  if (!claims || !(registry instanceof InstaboxDeviceRegistry)) {
    return null
  }
  try {
    return registry.getOrCreateInstaboxDevice(claims.sid, claims.scope)
  } catch (error) {
    // Why: an unwritable registry must refuse the client, not throw out of the handshake.
    console.error('[instabox] Failed to record an instabox session device:', error)
    return null
  }
}

/** A client admitted by an assertion holds no token; it keeps this one for its later sockets. */
export function instaboxIssuedDeviceToken(device: { deviceToken?: string }): {
  deviceToken?: string
} {
  return device.deviceToken ? { deviceToken: device.deviceToken } : {}
}
