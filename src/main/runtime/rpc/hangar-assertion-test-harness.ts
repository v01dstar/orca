// Signs assertions the way hangar-server does (internal/orcaauth.Signer) so runtime tests
// exercise the real wire format: compact JWS, EdDSA, RFC 8037 OKP JWK in the trust file.
import { generateKeyPairSync, sign } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const TEST_ISSUER = 'https://hangar.test'
export const TEST_MACHINE_ID = 'm_test'
export const TEST_OWNER_ID = '1001'

const b64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url')

export function createHangarTestIssuer(kid = 'test-kid') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const { x } = publicKey.export({ format: 'jwk' })
  const trust = {
    v: 1,
    issuer: TEST_ISSUER,
    keys: [{ kid, kty: 'OKP', crv: 'Ed25519', x }],
    machineId: TEST_MACHINE_ID,
    ownerId: TEST_OWNER_ID
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  return {
    trust,
    sign(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}): string {
      const head = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid, ...header }))
      const body = b64url(
        JSON.stringify({
          iss: TEST_ISSUER,
          aud: `orca:${TEST_MACHINE_ID}`,
          sub: TEST_OWNER_ID,
          sid: 'session-1',
          scope: 'runtime',
          iat: nowSeconds,
          exp: nowSeconds + 300,
          jti: 'jti-1',
          ...claims
        })
      )
      return `${head}.${body}.${b64url(sign(null, Buffer.from(`${head}.${body}`), privateKey))}`
    },
    writeTrustFile(dir: string): string {
      const path = join(dir, 'orca-trust.json')
      writeFileSync(path, JSON.stringify(trust))
      return path
    }
  }
}
