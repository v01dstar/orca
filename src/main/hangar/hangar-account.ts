// The desktop's hangar account: sign-in, token refresh and an authenticated API client.
import {
  createHangarApiClient,
  HangarApiError,
  type HangarApiClient
} from '../../shared/hangar/hangar-api-client'
import { beginHangarSignIn } from './hangar-sign-in'
import type { HangarAccountState, HangarSessionPersistence } from '../../shared/hangar/hangar-ipc'
import {
  clearHangarSession,
  readHangarSession,
  saveHangarSession,
  type HangarSession
} from './hangar-session-store'

// Why: refresh a minute early so a request never leaves with a token that expires in flight.
const REFRESH_SKEW_MS = 60_000

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
  private refreshing: Promise<HangarSession> | null = null
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

  private async accessToken(forceRefresh: boolean): Promise<string> {
    const session = this.session
    if (!session) {
      throw new HangarApiError(401, 'unauthenticated', 'Sign in to hangar first.')
    }
    const expiresAt = Date.parse(session.tokens.accessExpiresAt)
    if (!forceRefresh && expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return session.tokens.accessToken
    }
    // Why: one refresh at a time; hangar rotates refresh tokens and treats reuse as theft.
    this.refreshing ??= this.refresh(session).finally(() => {
      this.refreshing = null
    })
    return (await this.refreshing).tokens.accessToken
  }

  private async refresh(session: HangarSession): Promise<HangarSession> {
    try {
      const tokens = await createHangarApiClient({ baseUrl: session.serverUrl }).refresh(
        session.tokens.refreshToken
      )
      const next = { ...session, tokens }
      // Why: a sign-out or new sign-in during the request wins; do not resurrect the old session.
      if (this.session === session) {
        this.setSession(next)
      }
      return next
    } catch (error) {
      if (error instanceof HangarApiError && (error.status === 401 || error.status === 403)) {
        if (this.session === session) {
          this.session = null
          clearHangarSession(this.userDataPath)
          this.emit()
        }
      }
      throw error
    }
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
