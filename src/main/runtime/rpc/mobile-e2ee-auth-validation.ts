import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'
import { publicKeyFromBase64 } from './e2ee-crypto'
import { parseRemoteRuntimeJsonText } from '../../../shared/remote-runtime-request-frames'

// Exactly one credential: a paired device token, or (hangar machines) a hangar assertion.
export type MobileE2EEAuth = {
  type: 'e2ee_auth'
  deviceToken?: string
  hangarAssertion?: string
  clientCapabilities?: unknown
  v?: 2
  transcriptHashB64?: string
}

export function isValidMobileE2EEAuthVersion(
  auth: MobileE2EEAuth,
  v2Session: DesktopMobileE2EEV2Session | null
): boolean {
  if (!v2Session) {
    return auth.v === undefined && auth.transcriptHashB64 === undefined
  }
  const credential = auth.hangarAssertion !== undefined ? 'hangarAssertion' : 'deviceToken'
  // Why: mobile v2 keeps an exact transcript-bound shape; runtime capabilities use legacy paired-runtime auth.
  return (
    Object.keys(auth).sort().join(',') === `${credential},transcriptHashB64,type,v` &&
    auth.v === 2 &&
    auth.transcriptHashB64 === v2Session.transcriptHashB64
  )
}

export type E2EEDeviceResolvers<TDevice> = {
  resolveAuthenticatedDevice: (token: string) => TDevice | null
  // Why: absent unless `orca serve --trusted-issuer-file` enabled hangar assertions.
  resolveAssertedDevice?: (assertion: string) => TDevice | null
}

export function authenticateMobileE2EE<TDevice extends { deviceToken: string }>(
  args: {
    plaintext: string
    v2Session: DesktopMobileE2EEV2Session | null
  } & E2EEDeviceResolvers<TDevice>
):
  | { ok: true; device: TDevice; auth: MobileE2EEAuth }
  | { ok: false; code: 'bad_auth' | 'unauthorized' } {
  let auth: MobileE2EEAuth
  try {
    auth = parseRemoteRuntimeJsonText(args.plaintext) as MobileE2EEAuth
  } catch {
    return { ok: false, code: 'bad_auth' }
  }
  const token = typeof auth.deviceToken === 'string' ? auth.deviceToken : ''
  const assertion = typeof auth.hangarAssertion === 'string' ? auth.hangarAssertion : ''
  if (
    auth.type !== 'e2ee_auth' ||
    Boolean(token) === Boolean(assertion) ||
    !isValidMobileE2EEAuthVersion(auth, args.v2Session)
  ) {
    return { ok: false, code: 'bad_auth' }
  }
  if (assertion) {
    if (!args.resolveAssertedDevice) {
      return { ok: false, code: 'bad_auth' }
    }
    const device = args.resolveAssertedDevice(assertion)
    return device ? { ok: true, device, auth } : { ok: false, code: 'unauthorized' }
  }
  const device = args.resolveAuthenticatedDevice(token)
  return device?.deviceToken === token
    ? { ok: true, device, auth }
    : { ok: false, code: 'unauthorized' }
}

export function decodeMobileE2EEPublicKey(value: string): Uint8Array | null {
  try {
    return publicKeyFromBase64(value)
  } catch {
    return null
  }
}
