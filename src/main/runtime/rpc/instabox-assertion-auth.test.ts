import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authenticateInstaboxAssertion,
  parseInstaboxTrust,
  verifyInstaboxAssertion
} from './instabox-assertion-auth'
import { createInstaboxTestIssuer } from './instabox-assertion-test-harness'

const now = () => Math.floor(Date.now() / 1000)

describe('verifyInstaboxAssertion', () => {
  const issuer = createInstaboxTestIssuer()
  const trust = parseInstaboxTrust(JSON.stringify(issuer.trust))!

  it('accepts an assertion instabox signed for this machine and owner', () => {
    expect(verifyInstaboxAssertion(issuer.sign({ scope: 'mobile' }), trust, now())).toEqual({
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
    expect(verifyInstaboxAssertion(issuer.sign(claims(t)), trust, t)).toBeNull()
  })

  it('accepts clock skew within the leeway on both ends', () => {
    const t = now()
    expect(
      verifyInstaboxAssertion(issuer.sign({ exp: t - 299, iat: t + 299 }), trust, t)
    ).not.toBeNull()
  })

  it('rejects another key, an unknown kid, and a non-EdDSA alg', () => {
    const other = createInstaboxTestIssuer()
    expect(verifyInstaboxAssertion(other.sign(), trust, now())).toBeNull()
    expect(verifyInstaboxAssertion(issuer.sign({}, { kid: 'nope' }), trust, now())).toBeNull()
    expect(verifyInstaboxAssertion(issuer.sign({}, { alg: 'none' }), trust, now())).toBeNull()
  })

  it('rejects a tampered payload and malformed tokens', () => {
    const [head, , sig] = issuer.sign().split('.')
    const forged = Buffer.from(JSON.stringify({ sub: '1001' })).toString('base64url')
    expect(verifyInstaboxAssertion(`${head}.${forged}.${sig}`, trust, now())).toBeNull()
    expect(verifyInstaboxAssertion(`${issuer.sign()}=`, trust, now())).toBeNull()
    expect(verifyInstaboxAssertion('a.b', trust, now())).toBeNull()
    expect(verifyInstaboxAssertion('x'.repeat(5000), trust, now())).toBeNull()
  })
})

describe('parseInstaboxTrust', () => {
  const { trust } = createInstaboxTestIssuer()

  it('rejects other versions and trust without a usable Ed25519 key', () => {
    expect(parseInstaboxTrust(JSON.stringify({ ...trust, v: 2 }))).toBeNull()
    expect(parseInstaboxTrust(JSON.stringify({ ...trust, keys: [] }))).toBeNull()
    expect(
      parseInstaboxTrust(JSON.stringify({ ...trust, keys: [{ ...trust.keys[0], crv: 'X25519' }] }))
    ).toBeNull()
    expect(parseInstaboxTrust('not json')).toBeNull()
  })
})

describe('authenticateInstaboxAssertion', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
    dir = null
  })

  it('reads the trust file per call, so a missing or rewritten file takes effect', () => {
    dir = mkdtempSync(join(tmpdir(), 'instabox-orca-trust-'))
    const first = createInstaboxTestIssuer()
    const path = join(dir, 'orca-trust.json')
    expect(authenticateInstaboxAssertion(first.sign(), path)).toBeNull()

    first.writeTrustFile(dir)
    expect(authenticateInstaboxAssertion(first.sign(), path)?.sid).toBe('session-1')

    const rotated = createInstaboxTestIssuer()
    rotated.writeTrustFile(dir)
    expect(authenticateInstaboxAssertion(first.sign(), path)).toBeNull()
    expect(authenticateInstaboxAssertion(rotated.sign(), path)).not.toBeNull()
  })
})
