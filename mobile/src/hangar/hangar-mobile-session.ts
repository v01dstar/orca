// The phone's hangar session (fork): device-flow sign-in, tokens in the keychain, refreshed one
// at a time through the shared token source. Desktop keeps its own session (main/hangar).
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ExpoCrypto from 'expo-crypto'
import { Platform } from 'react-native'
import { z } from 'zod'
import {
  createHangarApiClient,
  type HangarApiClient
} from '../../../src/shared/hangar/hangar-api-client'
import {
  HangarTokensSchema,
  type HangarDeviceStart
} from '../../../src/shared/hangar/hangar-api-types'
import {
  createHangarTokenSource,
  type HangarStoredSession
} from '../../../src/shared/hangar/hangar-token-source'
import {
  deletePairingKeychainItem,
  readPairingKeychainItem,
  writePairingKeychainItem
} from '../transport/pairing-keychain'

// Why: SecureStore keys allow only [A-Za-z0-9._-].
const SESSION_KEY = 'orca.hangar.session'
const StoredSessionSchema = z.object({
  serverUrl: z.string().min(1),
  login: z.string(),
  tokens: HangarTokensSchema
})

let session: HangarStoredSession | null = null
let loaded: Promise<HangarStoredSession | null> | null = null
const listeners = new Set<(session: HangarStoredSession | null) => void>()

// Why: Hermes has no crypto.getRandomValues; expo-crypto provides the secure RNG.
const randomKey = (): string =>
  Array.from(ExpoCrypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('')

async function readStored(): Promise<string | null> {
  return Platform.OS === 'web'
    ? AsyncStorage.getItem(SESSION_KEY)
    : readPairingKeychainItem(SESSION_KEY)
}

async function writeStored(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    await (value === null
      ? AsyncStorage.removeItem(SESSION_KEY)
      : AsyncStorage.setItem(SESSION_KEY, value))
  } else if (value === null) {
    await deletePairingKeychainItem(SESSION_KEY)
  } else {
    await writePairingKeychainItem(SESSION_KEY, value)
  }
}

function setSession(next: HangarStoredSession | null): void {
  session = next
  void writeStored(next ? JSON.stringify(next) : null).catch(() => undefined)
  for (const listener of listeners) {
    listener(next)
  }
}

export function loadHangarSession(): Promise<HangarStoredSession | null> {
  loaded ??= readStored()
    .then((raw) => {
      const parsed = StoredSessionSchema.safeParse(raw ? JSON.parse(raw) : null)
      session = parsed.success ? parsed.data : null
      return session
    })
    .catch(() => null)
  return loaded
}

export function onHangarSessionChange(
  listener: (session: HangarStoredSession | null) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const accessToken = createHangarTokenSource({ current: () => session, replace: setSession })

export function hangarClient(serverUrl?: string): HangarApiClient {
  const baseUrl = serverUrl ?? session?.serverUrl
  if (!baseUrl) {
    throw new Error('Sign in to hangar first.')
  }
  return createHangarApiClient({
    baseUrl,
    randomKey,
    ...(serverUrl ? {} : { getAccessToken: accessToken })
  })
}

export async function signInToHangar(
  serverUrl: string,
  onCode: (start: HangarDeviceStart) => void,
  signal?: AbortSignal
): Promise<HangarStoredSession> {
  const origin = new URL(serverUrl.trim()).origin
  const anonymous = hangarClient(origin)
  const start = await anonymous.startDeviceLogin()
  onCode(start)
  const tokens = await anonymous.waitForDeviceLogin(start, signal)
  const me = await createHangarApiClient({
    baseUrl: origin,
    randomKey,
    getAccessToken: async () => tokens.accessToken
  }).me()
  const next = { serverUrl: origin, login: me.login, tokens }
  setSession(next)
  return next
}

export async function signOutOfHangar(): Promise<void> {
  if (session) {
    await hangarClient()
      .logout()
      .catch(() => undefined)
  }
  setSession(null)
}

export function currentHangarSession(): HangarStoredSession | null {
  return session
}
