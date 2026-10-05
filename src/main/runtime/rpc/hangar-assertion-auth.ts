// Why: a hangar machine's clients sign in to hangar, not to this runtime. hangar hands them a
// short-lived EdDSA assertion (compact JWS) and provisions the keys that sign it into a trust
// file, so `e2ee_auth` can carry that assertion instead of a paired device token. Mirrors
// hangar's reference check, internal/orcaauth.Verify.
import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { DeviceScope } from '../../../shared/runtime-types'

export const HANGAR_ASSERTION_AUDIENCE_PREFIX = 'orca:'
// Why: the guest clock steps on resume and may lag when hangar's clock sync failed.
export const HANGAR_ASSERTION_LEEWAY_SECONDS = 300
const MAX_ASSERTION_CHARS = 4096
const MAX_TRUST_FILE_BYTES = 64 * 1024
const MAX_SESSION_ID_CHARS = 128

let assertionAuthEnabled = false

/** Serve startup: a trust file enables assertion auth, which status.get then advertises. */
export function enableHangarAssertionAuth(
  trustFile: string | null | undefined
): string | undefined {
  assertionAuthEnabled = Boolean(trustFile)
  return trustFile ?? undefined
}

export function isHangarAssertionAuthEnabled(): boolean {
  return assertionAuthEnabled
}

export type HangarTrust = {
  issuer: string
  machineId: string
  ownerId: string
  keys: ReadonlyMap<string, KeyObject>
}

export type HangarAssertionClaims = {
  sub: string
  sid: string
  scope: DeviceScope
}

const BASE64URL = /^[A-Za-z0-9_-]*$/
const nonEmpty = z.string().min(1)
const TrustSchema = z.object({
  v: z.literal(1),
  issuer: nonEmpty,
  machineId: nonEmpty,
  ownerId: nonEmpty,
  keys: z.array(z.unknown())
})
// RFC 8037 OKP JWK, as hangar's GET /v1/orca/keys and trust file publish it.
const KeySchema = z.object({
  kid: nonEmpty,
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string()
})
const HeaderSchema = z.object({ alg: z.literal('EdDSA'), kid: z.string() })
const ClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  sid: nonEmpty.max(MAX_SESSION_ID_CHARS),
  scope: z.enum(['runtime', 'mobile']),
  iat: z.number(),
  exp: z.number()
})

function decodeBase64Url(value: string): Buffer | null {
  if (!BASE64URL.test(value)) {
    return null
  }
  const bytes = Buffer.from(value, 'base64url')
  // Why: strict like hangar's RawURLEncoding.Strict(); reject non-canonical trailing bits.
  return bytes.toString('base64url') === value ? bytes : null
}

function parseJson(bytes: Buffer | null): unknown {
  if (!bytes) {
    return null
  }
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    return null
  }
}

export function parseHangarTrust(text: string): HangarTrust | null {
  const trust = TrustSchema.safeParse(parseJson(Buffer.from(text, 'utf8')))
  if (!trust.success) {
    return null
  }
  const keys = new Map<string, KeyObject>()
  for (const entry of trust.data.keys) {
    const key = KeySchema.safeParse(entry)
    if (key.success && decodeBase64Url(key.data.x)?.length === 32) {
      const { kty, crv, x } = key.data
      keys.set(key.data.kid, createPublicKey({ key: { kty, crv, x }, format: 'jwk' }))
    }
  }
  const { issuer, machineId, ownerId } = trust.data
  return keys.size > 0 ? { issuer, machineId, ownerId, keys } : null
}

export function readHangarTrustFile(path: string): HangarTrust | null {
  try {
    const bytes = readFileSync(path)
    return bytes.length <= MAX_TRUST_FILE_BYTES ? parseHangarTrust(bytes.toString('utf8')) : null
  } catch {
    // Why: hangar writes the file on first connection; until then no assertion can be valid.
    return null
  }
}

export function verifyHangarAssertion(
  token: string,
  trust: HangarTrust,
  nowSeconds: number
): HangarAssertionClaims | null {
  if (token.length > MAX_ASSERTION_CHARS) {
    return null
  }
  const [headerPart = '', payloadPart = '', signaturePart = '', ...extra] = token.split('.')
  const header = HeaderSchema.safeParse(parseJson(decodeBase64Url(headerPart)))
  const key = header.success ? trust.keys.get(header.data.kid) : undefined
  const signature = decodeBase64Url(signaturePart)
  if (
    extra.length > 0 ||
    !key ||
    !signature ||
    !verify(null, Buffer.from(`${headerPart}.${payloadPart}`), key, signature)
  ) {
    return null
  }
  const parsed = ClaimsSchema.safeParse(parseJson(decodeBase64Url(payloadPart)))
  if (!parsed.success) {
    return null
  }
  const claims = parsed.data
  if (
    claims.iss !== trust.issuer ||
    claims.aud !== HANGAR_ASSERTION_AUDIENCE_PREFIX + trust.machineId ||
    claims.sub !== trust.ownerId ||
    nowSeconds > claims.exp + HANGAR_ASSERTION_LEEWAY_SECONDS ||
    nowSeconds < claims.iat - HANGAR_ASSERTION_LEEWAY_SECONDS
  ) {
    return null
  }
  return { sub: claims.sub, sid: claims.sid, scope: claims.scope }
}

/** Reads the trust file per call: hangar rewrites it on every machine revision. */
export function authenticateHangarAssertion(
  token: string,
  trustFilePath: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): HangarAssertionClaims | null {
  const trust = readHangarTrustFile(trustFilePath)
  return trust ? verifyHangarAssertion(token, trust, nowSeconds) : null
}
