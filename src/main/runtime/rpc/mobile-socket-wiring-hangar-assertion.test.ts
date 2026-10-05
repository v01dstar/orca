import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceRegistry } from '../device-registry'
import { decrypt, deriveSharedKey, encrypt, generateKeyPair } from './e2ee-crypto'
import { createHangarTestIssuer } from './hangar-assertion-test-harness'
import { MobileSocketWiring } from './mobile-socket-wiring'
import { FakeSocket, FakeTransport } from './mobile-socket-wiring-test-harness'

describe('MobileSocketWiring hangar assertions', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-hangar-wiring-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function connect(auth: Record<string, unknown>, options: { trustedIssuerFile?: string } = {}) {
    const desktop = generateKeyPair()
    const client = generateKeyPair()
    const ws = new FakeSocket()
    const transport = new FakeTransport()
    const onText = vi.fn()
    const registry = new DeviceRegistry(dir)
    const wiring = new MobileSocketWiring({
      deviceRegistry: registry,
      e2eeKeypair: {
        publicKey: desktop.publicKey,
        secretKey: desktop.secretKey,
        publicKeyB64: Buffer.from(desktop.publicKey).toString('base64')
      },
      onText,
      onBinary: vi.fn(),
      onClose: vi.fn(),
      ...options
    })
    wiring.attachTransport(transport)
    transport.receive(
      ws,
      JSON.stringify({
        type: 'e2ee_hello',
        publicKeyB64: Buffer.from(client.publicKey).toString('base64')
      })
    )
    const sharedKey = deriveSharedKey(client.secretKey, desktop.publicKey)
    transport.receive(ws, encrypt(JSON.stringify({ type: 'e2ee_auth', ...auth }), sharedKey))
    const control = ws.sent
      .slice(1)
      .map((frame) => JSON.parse(decrypt(String(frame), sharedKey) ?? 'null'))
    return { ws, transport, onText, registry, sharedKey, control }
  }

  it('authenticates a hangar session as one device per sid on a direct socket', () => {
    const issuer = createHangarTestIssuer()
    const trustedIssuerFile = issuer.writeTrustFile(dir)
    const first = connect({ hangarAssertion: issuer.sign() }, { trustedIssuerFile })

    const devices = first.registry.listDevices()
    expect(devices).toHaveLength(1)
    expect(first.control).toEqual([{ type: 'e2ee_authenticated', deviceToken: devices[0]!.token }])
    expect(devices[0]).toMatchObject({ hangarSessionId: 'session-1', scope: 'runtime' })
    expect(first.transport.setClientId).toHaveBeenCalledWith(first.ws, devices[0]!.token)

    transportSends(first, '{"id":"rpc-1","method":"status.get"}')
    expect(first.onText.mock.calls[0]?.[0]).toMatchObject({
      device: { deviceId: devices[0]!.deviceId, scope: 'runtime' }
    })

    const second = connect({ hangarAssertion: issuer.sign() }, { trustedIssuerFile })
    expect(second.control).toEqual([{ type: 'e2ee_authenticated', deviceToken: devices[0]!.token }])
    expect(second.registry.listDevices().map((d) => d.deviceId)).toEqual([devices[0]!.deviceId])

    // Later sockets authenticate with the issued token like a paired device, and get no token back.
    const paired = connect({ deviceToken: devices[0]!.token }, { trustedIssuerFile })
    expect(paired.control).toEqual([{ type: 'e2ee_authenticated' }])
  })

  it('refuses an assertion when the runtime was not started with a trust file', () => {
    const issuer = createHangarTestIssuer()
    issuer.writeTrustFile(dir)
    const { ws, registry } = connect({ hangarAssertion: issuer.sign() })

    expect(ws.close).toHaveBeenCalledWith(4001, 'Invalid e2ee_auth')
    expect(registry.listDevices()).toEqual([])
  })

  it('refuses an assertion from an untrusted key, and both credentials at once', () => {
    const issuer = createHangarTestIssuer()
    const trustedIssuerFile = issuer.writeTrustFile(dir)
    const forged = connect(
      { hangarAssertion: createHangarTestIssuer().sign() },
      { trustedIssuerFile }
    )
    expect(forged.ws.close).toHaveBeenCalledWith(4001, 'Unauthorized')

    const both = connect(
      { hangarAssertion: issuer.sign(), deviceToken: 'paired-token' },
      { trustedIssuerFile }
    )
    expect(both.ws.close).toHaveBeenCalledWith(4001, 'Invalid e2ee_auth')
    expect(both.registry.listDevices()).toEqual([])
  })
})

function transportSends(
  session: { transport: FakeTransport; ws: FakeSocket; sharedKey: Uint8Array },
  plaintext: string
): void {
  session.transport.receive(session.ws, encrypt(plaintext, session.sharedKey))
}
