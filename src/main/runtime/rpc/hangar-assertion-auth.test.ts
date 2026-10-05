import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authenticateHangarAssertion,
  parseHangarTrust,
  verifyHangarAssertion
} from './hangar-assertion-auth'
import { createHangarTestIssuer } from './hangar-assertion-test-harness'

const now = () => Math.floor(Date.now() / 1000)

describe('verifyHangarAssertion', () => {
  const issuer = createHangarTestIssuer()
  const trust = parseHangarTrust(JSON.stringify(issuer.trust))!

  it('accepts an assertion hangar signed for this machine and owner', () => {
    expect(verifyHangarAssertion(issuer.sign({ scope: 'mobile' }), trust, now())).toEqual({
      sub: '1001',
      sid: 'session-1',
      scope: 'mobile'
    })
  })

  it.each([
    ['another issuer', () => ({ iss: 'https://evil.test' })],
    ['another machine', () => ({ aud: 'orca:m_other' })],
    ['another owner', () => ({ sub: '1002' })],
    ['an unknown scope', () => ({ scope: 'admin' })],
    ['no session', () => ({ sid: '' })],
    ['an oversized session id', () => ({ sid: 'x'.repeat(129) })],
    ['expiry past the leeway', (t: number) => ({ exp: t - 301 })],
    ['issue time past the leeway', (t: number) => ({ iat: t + 301 })],
    ['a non-numeric expiry', (t: number) => ({ exp: String(t + 60) })]
  ])('rejects %s', (_name, claims) => {
    const t = now()
    expect(verifyHangarAssertion(issuer.sign(claims(t)), trust, t)).toBeNull()
  })

  it('accepts clock skew within the leeway on both ends', () => {
    const t = now()
    expect(
      verifyHangarAssertion(issuer.sign({ exp: t - 299, iat: t + 299 }), trust, t)
    ).not.toBeNull()
  })

  it('rejects another key, an unknown kid, and a non-EdDSA alg', () => {
    const other = createHangarTestIssuer()
    expect(verifyHangarAssertion(other.sign(), trust, now())).toBeNull()
    expect(verifyHangarAssertion(issuer.sign({}, { kid: 'nope' }), trust, now())).toBeNull()
    expect(verifyHangarAssertion(issuer.sign({}, { alg: 'none' }), trust, now())).toBeNull()
  })

  it('rejects a tampered payload and malformed tokens', () => {
    const [head, , sig] = issuer.sign().split('.')
    const forged = Buffer.from(JSON.stringify({ sub: '1001' })).toString('base64url')
    expect(verifyHangarAssertion(`${head}.${forged}.${sig}`, trust, now())).toBeNull()
    expect(verifyHangarAssertion(`${issuer.sign()}=`, trust, now())).toBeNull()
    expect(verifyHangarAssertion('a.b', trust, now())).toBeNull()
    expect(verifyHangarAssertion('x'.repeat(5000), trust, now())).toBeNull()
  })
})

describe('parseHangarTrust', () => {
  const { trust } = createHangarTestIssuer()

  it('rejects other versions and trust without a usable Ed25519 key', () => {
    expect(parseHangarTrust(JSON.stringify({ ...trust, v: 2 }))).toBeNull()
    expect(parseHangarTrust(JSON.stringify({ ...trust, keys: [] }))).toBeNull()
    expect(
      parseHangarTrust(JSON.stringify({ ...trust, keys: [{ ...trust.keys[0], crv: 'X25519' }] }))
    ).toBeNull()
    expect(parseHangarTrust('not json')).toBeNull()
  })
})

describe('authenticateHangarAssertion', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
    dir = null
  })

  it('reads the trust file per call, so a missing or rewritten file takes effect', () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-hangar-trust-'))
    const first = createHangarTestIssuer()
    const path = join(dir, 'orca-trust.json')
    expect(authenticateHangarAssertion(first.sign(), path)).toBeNull()

    first.writeTrustFile(dir)
    expect(authenticateHangarAssertion(first.sign(), path)?.sid).toBe('session-1')

    const rotated = createHangarTestIssuer()
    rotated.writeTrustFile(dir)
    expect(authenticateHangarAssertion(first.sign(), path)).toBeNull()
    expect(authenticateHangarAssertion(rotated.sign(), path)).not.toBeNull()
  })
})
