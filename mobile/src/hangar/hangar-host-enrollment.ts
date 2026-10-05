// Fork: adds a hangar machine as an Orca host without pairing. One socket authenticates with a
// hangar assertion; the runtime answers with this session's device token, and the host is saved
// like a paired one whose endpoint resolves a fresh tunnel ticket per socket.
import type { HangarMachine } from '../../../src/shared/hangar/hangar-api-types'
import {
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from '../transport/e2ee'
import { savePairedHost } from '../transport/host-store'
import type { HostProfile } from '../transport/types'
import { hangarEndpointFor } from './hangar-lazy-websocket'
import { currentHangarSession, hangarClient } from './hangar-mobile-session'

const ENROLL_TIMEOUT_MS = 20_000

function issueDeviceToken(
  endpoint: string,
  assertion: string,
  serverPublicKeyB64: string
): Promise<string> {
  const keys = generateKeyPair()
  const sharedKey = deriveSharedKey(keys.secretKey, publicKeyFromBase64(serverPublicKeyB64))
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint)
    let step: 'hello' | 'auth' | 'done' = 'hello'
    const finish = (error: Error | null, token?: string): void => {
      if (step === 'done') {
        return
      }
      step = 'done'
      clearTimeout(timer)
      ws.close()
      if (error || !token) {
        reject(error ?? new Error('hangar enrollment failed'))
      } else {
        resolve(token)
      }
    }
    const timer = setTimeout(
      () => finish(new Error('hangar enrollment timed out')),
      ENROLL_TIMEOUT_MS
    )
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: 'e2ee_hello', publicKeyB64: publicKeyToBase64(keys.publicKey) })
      )
    }
    ws.onmessage = (event) => {
      const text = String(event.data)
      if (step === 'hello') {
        if (!text.includes('"e2ee_ready"')) {
          finish(new Error('the runtime did not start E2EE'))
          return
        }
        step = 'auth'
        ws.send(
          encrypt(JSON.stringify({ type: 'e2ee_auth', hangarAssertion: assertion }), sharedKey)
        )
        return
      }
      const reply: unknown = JSON.parse(decrypt(text, sharedKey) ?? 'null')
      const token =
        reply && typeof reply === 'object' && 'deviceToken' in reply ? reply.deviceToken : null
      // Why: an e2ee_error means the runtime refused the assertion (or predates hangar support).
      finish(
        typeof token === 'string' && token
          ? null
          : new Error('the runtime refused the hangar sign-in'),
        typeof token === 'string' ? token : undefined
      )
    }
    ws.onerror = () => finish(new Error('could not reach the machine through hangar'))
    ws.onclose = (event) => finish(new Error(`hangar tunnel closed (${event.code})`))
  })
}

/** Enrolls this phone's hangar session on the machine and saves it as a host. */
export async function addHangarMachineAsHost(machine: HangarMachine): Promise<HostProfile> {
  const session = currentHangarSession()
  if (!session) {
    throw new Error('Sign in to hangar first.')
  }
  const connection = await hangarClient().createOrcaConnection(machine.id, 'mobile')
  const deviceToken = await issueDeviceToken(
    connection.endpoint,
    connection.assertion,
    connection.serverPublicKey
  )
  const host: HostProfile = {
    id: `hangar-${machine.id}`,
    name: machine.name,
    endpoint: hangarEndpointFor(session.serverUrl, machine.id),
    deviceToken,
    publicKeyB64: connection.serverPublicKey,
    lastConnected: 0
  }
  await savePairedHost(host)
  return host
}
