// The desktop's hangar account: sign-in, token refresh and an authenticated API client.
import {
  createHangarApiClient,
  HangarApiError,
  type HangarApiClient
} from '../../shared/hangar/hangar-api-client'
import { createHangarTokenSource } from '../../shared/hangar/hangar-token-source'
import { beginHangarSignIn } from './hangar-sign-in'
import type { HangarAccountState, HangarSessionPersistence } from '../../shared/hangar/hangar-ipc'
import {
  clearHangarSession,
  readHangarSession,
  saveHangarSession,
  type HangarSession
} from './hangar-session-store'

export function normalizeHangarServerUrl(raw: string): string {
  const url = new URL(raw.trim())
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('hangar server URL must use https')
  }
  return url.origin
}

export class HangarAccount {
  private session: HangarSession | null
  private persistence: HangarSessionPersistence = 'encrypted'
  private lastServerUrl: string | null
  private readonly accessToken = createHangarTokenSource({
    current: () => this.session,
    replace: (next) => {
      if (next) {
        this.setSession(next)
      } else {
        this.session = null
        clearHangarSession(this.userDataPath)
        this.emit()
      }
    }
  })
  private readonly listeners = new Set<(state: HangarAccountState) => void>()

  constructor(private readonly userDataPath: string) {
    this.session = readHangarSession(userDataPath)
    this.lastServerUrl = this.session?.serverUrl ?? null
  }

  state(): HangarAccountState {
    return this.session
      ? {
          signedIn: true,
          serverUrl: this.session.serverUrl,
          login: this.session.login,
          persistence: this.persistence
        }
      : { signedIn: false, serverUrl: this.lastServerUrl }
  }

  onChange(listener: (state: HangarAccountState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async signIn(serverUrlInput: string): Promise<HangarAccountState> {
    const serverUrl = normalizeHangarServerUrl(serverUrlInput)
    const code = await beginHangarSignIn(serverUrl)
    const tokens = await createHangarApiClient({ baseUrl: serverUrl }).exchangeCliCode(code)
    const me = await createHangarApiClient({
      baseUrl: serverUrl,
      getAccessToken: async () => tokens.accessToken
    }).me()
    this.setSession({ serverUrl, login: me.login, tokens })
    return this.state()
  }

  async signOut(): Promise<HangarAccountState> {
    const session = this.session
    if (session) {
      // Best effort: the local session goes even when hangar cannot be reached.
      await this.client()
        .logout()
        .catch(() => undefined)
    }
    this.session = null
    clearHangarSession(this.userDataPath)
    this.emit()
    return this.state()
  }

  /** An API client for the signed-in account; throws when signed out. */
  client(): HangarApiClient {
    const session = this.session
    if (!session) {
      throw new HangarApiError(401, 'unauthenticated', 'Sign in to hangar first.')
    }
    return createHangarApiClient({
      baseUrl: session.serverUrl,
      getAccessToken: (forceRefresh) => this.accessToken(forceRefresh)
    })
  }

  private setSession(session: HangarSession): void {
    this.session = session
    this.lastServerUrl = session.serverUrl
    this.persistence = saveHangarSession(this.userDataPath, session)
    this.emit()
  }

  private emit(): void {
    const state = this.state()
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
