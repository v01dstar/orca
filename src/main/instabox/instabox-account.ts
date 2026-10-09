// The desktop's instabox account: sign-in, token refresh and an authenticated API client.
import {
  createInstaboxApiClient,
  InstaboxApiError,
  type InstaboxApiClient
} from '../../shared/instabox/instabox-api-client'
import { createInstaboxTokenSource } from '../../shared/instabox/instabox-token-source'
import { beginInstaboxSignIn } from './instabox-sign-in'
import type {
  InstaboxAccountState,
  InstaboxSessionPersistence
} from '../../shared/instabox/instabox-ipc'
import {
  clearInstaboxSession,
  readInstaboxSession,
  saveInstaboxSession,
  type InstaboxSession
} from './instabox-session-store'

export function normalizeInstaboxServerUrl(raw: string): string {
  const url = new URL(raw.trim())
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('Instabox server URL must use https')
  }
  return url.origin
}

export class InstaboxAccount {
  private session: InstaboxSession | null
  private persistence: InstaboxSessionPersistence = 'encrypted'
  private lastServerUrl: string | null
  private readonly accessToken = createInstaboxTokenSource({
    current: () => this.session,
    replace: (next) => {
      if (next) {
        this.setSession(next)
      } else {
        this.session = null
        clearInstaboxSession(this.userDataPath)
        this.emit()
      }
    }
  })
  private readonly listeners = new Set<(state: InstaboxAccountState) => void>()

  constructor(private readonly userDataPath: string) {
    this.session = readInstaboxSession(userDataPath)
    this.lastServerUrl = this.session?.serverUrl ?? null
  }

  state(): InstaboxAccountState {
    return this.session
      ? {
          signedIn: true,
          serverUrl: this.session.serverUrl,
          login: this.session.login,
          persistence: this.persistence
        }
      : { signedIn: false, serverUrl: this.lastServerUrl }
  }

  onChange(listener: (state: InstaboxAccountState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async signIn(serverUrlInput: string): Promise<InstaboxAccountState> {
    const serverUrl = normalizeInstaboxServerUrl(serverUrlInput)
    const code = await beginInstaboxSignIn(serverUrl)
    const tokens = await createInstaboxApiClient({ baseUrl: serverUrl }).exchangeCliCode(code)
    const me = await createInstaboxApiClient({
      baseUrl: serverUrl,
      getAccessToken: async () => tokens.accessToken
    }).me()
    this.setSession({ serverUrl, login: me.login, tokens })
    return this.state()
  }

  async signOut(): Promise<InstaboxAccountState> {
    const session = this.session
    if (session) {
      // Best effort: the local session goes even when instabox cannot be reached.
      await this.client()
        .logout()
        .catch(() => undefined)
    }
    this.session = null
    clearInstaboxSession(this.userDataPath)
    this.emit()
    return this.state()
  }

  /** An API client for the signed-in account; throws when signed out. */
  client(): InstaboxApiClient {
    const session = this.session
    if (!session) {
      throw new InstaboxApiError(401, 'unauthenticated', 'Sign in to Instabox first.')
    }
    return createInstaboxApiClient({
      baseUrl: session.serverUrl,
      getAccessToken: (forceRefresh) => this.accessToken(forceRefresh)
    })
  }

  private setSession(session: InstaboxSession): void {
    this.session = session
    this.lastServerUrl = session.serverUrl
    this.persistence = saveInstaboxSession(this.userDataPath, session)
    this.emit()
  }

  private emit(): void {
    const state = this.state()
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
