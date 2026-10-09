// The phone's instabox session (fork): device-flow sign-in, tokens in the keychain, refreshed one
// at a time through the shared token source. Desktop keeps its own session (main/instabox).
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ExpoCrypto from 'expo-crypto'
import { Platform } from 'react-native'
import { z } from 'zod'
import {
  createInstaboxApiClient,
  type InstaboxApiClient
} from '../../../src/shared/instabox/instabox-api-client'
import {
  InstaboxTokensSchema,
  type InstaboxDeviceStart
} from '../../../src/shared/instabox/instabox-api-types'
import {
  createInstaboxTokenSource,
  type InstaboxStoredSession
} from '../../../src/shared/instabox/instabox-token-source'
import {
  deletePairingKeychainItem,
  readPairingKeychainItem,
  writePairingKeychainItem
} from '../transport/pairing-keychain'

// Why: SecureStore keys allow only [A-Za-z0-9._-].
const SESSION_KEY = 'orca.instabox.session'
const StoredSessionSchema = z.object({
  serverUrl: z.string().min(1),
  login: z.string(),
  tokens: InstaboxTokensSchema
})

let session: InstaboxStoredSession | null = null
let sessionChanged = false
let loaded: Promise<void> | null = null
const listeners = new Set<(session: InstaboxStoredSession | null) => void>()

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

function setSession(next: InstaboxStoredSession | null): void {
  session = next
  sessionChanged = true
  void writeStored(next ? JSON.stringify(next) : null).catch(() => undefined)
  for (const listener of listeners) {
    listener(next)
  }
}

// Why: reads storage once, then answers from memory — a sign-in after that first read must count.
export function loadInstaboxSession(): Promise<InstaboxStoredSession | null> {
  loaded ??= readStored()
    .then((raw) => {
      const parsed = StoredSessionSchema.safeParse(raw ? JSON.parse(raw) : null)
      if (!sessionChanged) {
        session = parsed.success ? parsed.data : null
      }
    })
    .catch(() => undefined)
  return loaded.then(() => session)
}

export function onInstaboxSessionChange(
  listener: (session: InstaboxStoredSession | null) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const accessToken = createInstaboxTokenSource({ current: () => session, replace: setSession })

export function instaboxClient(serverUrl?: string): InstaboxApiClient {
  const baseUrl = serverUrl ?? session?.serverUrl
  if (!baseUrl) {
    throw new Error('Sign in to Instabox first.')
  }
  return createInstaboxApiClient({
    baseUrl,
    randomKey,
    ...(serverUrl ? {} : { getAccessToken: accessToken })
  })
}

export async function signInToInstabox(
  serverUrl: string,
  onCode: (start: InstaboxDeviceStart) => void,
  signal?: AbortSignal
): Promise<InstaboxStoredSession> {
  const origin = new URL(serverUrl.trim()).origin
  const anonymous = instaboxClient(origin)
  const start = await anonymous.startDeviceLogin()
  onCode(start)
  const tokens = await anonymous.waitForDeviceLogin(start, signal)
  const me = await createInstaboxApiClient({
    baseUrl: origin,
    randomKey,
    getAccessToken: async () => tokens.accessToken
  }).me()
  const next = { serverUrl: origin, login: me.login, tokens }
  setSession(next)
  return next
}

export async function signOutOfInstabox(): Promise<void> {
  if (session) {
    await instaboxClient()
      .logout()
      .catch(() => undefined)
  }
  setSession(null)
}

export function currentInstaboxSession(): InstaboxStoredSession | null {
  return session
}
