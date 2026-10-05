import { describe, expect, it, vi } from 'vitest'
import { authenticateMobileE2EE } from './mobile-e2ee-auth-validation'
import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'

const device = { deviceId: 'd-1', deviceToken: 'token-1' }
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: validation reads only transcriptHashB64.
const v2Session = { transcriptHashB64: 'hash' } as unknown as DesktopMobileE2EEV2Session

function run(
  auth: Record<string, unknown>,
  options: { v2?: boolean; assertions?: boolean } = {}
): ReturnType<typeof authenticateMobileE2EE> {
  return authenticateMobileE2EE({
    plaintext: JSON.stringify({ type: 'e2ee_auth', ...auth }),
    v2Session: options.v2 ? v2Session : null,
    resolveAuthenticatedDevice: (token) => (token === device.deviceToken ? device : null),
    ...(options.assertions === false
      ? {}
      : { resolveAssertedDevice: vi.fn((a: string) => (a === 'good' ? device : null)) })
  })
}

describe('authenticateMobileE2EE with hangar assertions', () => {
  it('accepts exactly one credential in the legacy and v2 shapes', () => {
    expect(run({ hangarAssertion: 'good' })).toMatchObject({ ok: true, device })
    expect(run({ deviceToken: 'token-1' })).toMatchObject({ ok: true, device })
    expect(
      run({ v: 2, transcriptHashB64: 'hash', hangarAssertion: 'good' }, { v2: true })
    ).toMatchObject({ ok: true, device })
    expect(
      run({ v: 2, transcriptHashB64: 'hash', deviceToken: 'token-1' }, { v2: true })
    ).toMatchObject({ ok: true, device })
  })

  it('rejects both credentials, neither, and extra v2 keys as malformed', () => {
    expect(run({ hangarAssertion: 'good', deviceToken: 'token-1' })).toEqual({
      ok: false,
      code: 'bad_auth'
    })
    expect(run({})).toEqual({ ok: false, code: 'bad_auth' })
    expect(
      run(
        { v: 2, transcriptHashB64: 'hash', hangarAssertion: 'good', clientCapabilities: [] },
        { v2: true }
      )
    ).toEqual({ ok: false, code: 'bad_auth' })
  })

  it('treats an assertion as malformed when assertions are not enabled', () => {
    expect(run({ hangarAssertion: 'good' }, { assertions: false })).toEqual({
      ok: false,
      code: 'bad_auth'
    })
  })

  it('rejects an assertion the resolver does not accept as unauthorized', () => {
    expect(run({ hangarAssertion: 'bad' })).toEqual({ ok: false, code: 'unauthorized' })
  })
})
