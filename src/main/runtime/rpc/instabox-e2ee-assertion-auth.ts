import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'
import type { ClassifiedE2EEAuth } from './mobile-e2ee-auth-validation'

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
