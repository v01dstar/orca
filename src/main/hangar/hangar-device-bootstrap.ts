// Trades a hangar assertion for this hangar session's device token on a machine's Orca runtime
// (the runtime returns it in `e2ee_authenticated`). Later sockets use that token like a paired
// device, so Orca's connection code needs nothing hangar-specific beyond the tunnel endpoint.
import WebSocket from 'ws'
import { decrypt, deriveSharedKey, encrypt, generateKeyPair } from '../../shared/e2ee-crypto'
import type { HangarOrcaConnection } from '../../shared/hangar/hangar-api-types'

const BOOTSTRAP_TIMEOUT_MS = 20_000

export type HangarDeviceCredentials = { deviceToken: string; publicKeyB64: string }

export function bootstrapHangarDevice(
  connection: HangarOrcaConnection
): Promise<HangarDeviceCredentials> {
  const client = generateKeyPair()
  const sharedKey = deriveSharedKey(
    client.secretKey,
    Uint8Array.from(Buffer.from(connection.serverPublicKey, 'base64'))
  )
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(connection.endpoint, { handshakeTimeout: BOOTSTRAP_TIMEOUT_MS })
    let step: 'hello' | 'auth' | 'done' = 'hello'
    const fail = (message: string): void => {
      if (step !== 'done') {
        step = 'done'
        clearTimeout(timer)
        ws.terminate()
        reject(new Error(`hangar_bootstrap_failed: ${message}`))
      }
    }
    const timer = setTimeout(() => fail('timeout'), BOOTSTRAP_TIMEOUT_MS)
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: Buffer.from(client.publicKey).toString('base64')
        })
      )
    })
    ws.on('message', (data) => {
      const text = data.toString()
      if (step === 'hello') {
        if (!text.includes('"e2ee_ready"')) {
          fail('no e2ee_ready')
          return
        }
        step = 'auth'
        ws.send(
          encrypt(
            JSON.stringify({ type: 'e2ee_auth', hangarAssertion: connection.assertion }),
            sharedKey
          )
        )
        return
      }
      const reply: unknown = JSON.parse(decrypt(text, sharedKey) ?? 'null')
      const token =
        reply && typeof reply === 'object' && 'deviceToken' in reply ? reply.deviceToken : null
      if (typeof token !== 'string' || !token) {
        // Why: e2ee_error (refused assertion) or a runtime without assertion support.
        fail(JSON.stringify(reply).slice(0, 200))
        return
      }
      step = 'done'
      clearTimeout(timer)
      ws.close(1000)
      resolve({ deviceToken: token, publicKeyB64: connection.serverPublicKey })
    })
    ws.on('error', (error) => fail(error.message))
    ws.on('close', (code) => fail(`closed ${code}`))
  })
}
