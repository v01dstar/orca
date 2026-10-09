// Access tokens for a stored instabox session, refreshed one at a time (desktop and mobile).
import { createInstaboxApiClient, InstaboxApiError } from './instabox-api-client'
import type { InstaboxTokens } from './instabox-api-types'

export type InstaboxStoredSession = { serverUrl: string; login: string; tokens: InstaboxTokens }

// Why: refresh a minute early so a request never leaves with a token that expires in flight.
const REFRESH_SKEW_MS = 60_000

export type InstaboxSessionHolder = {
  current(): InstaboxStoredSession | null
  /** The refreshed session, or null when instabox rejected the refresh token (signed out). */
  replace(next: InstaboxStoredSession | null): void
}

export function createInstaboxTokenSource(
  holder: InstaboxSessionHolder,
  fetchImpl?: typeof fetch
): (forceRefresh: boolean) => Promise<string> {
  let refreshing: Promise<InstaboxStoredSession> | null = null

  async function refresh(session: InstaboxStoredSession): Promise<InstaboxStoredSession> {
    try {
      const tokens = await createInstaboxApiClient({
        baseUrl: session.serverUrl,
        fetchImpl
      }).refresh(session.tokens.refreshToken)
      const next = { ...session, tokens }
      // Why: a sign-out or new sign-in during the request wins; do not resurrect the old session.
      if (holder.current() === session) {
        holder.replace(next)
      }
      return next
    } catch (error) {
      const rejected =
        error instanceof InstaboxApiError && (error.status === 401 || error.status === 403)
      if (rejected && holder.current() === session) {
        holder.replace(null)
      }
      throw error
    }
  }

  return async (forceRefresh) => {
    const session = holder.current()
    if (!session) {
      throw new InstaboxApiError(401, 'unauthenticated', 'Sign in to Instabox first.')
    }
    if (
      !forceRefresh &&
      Date.parse(session.tokens.accessExpiresAt) - Date.now() > REFRESH_SKEW_MS
    ) {
      return session.tokens.accessToken
    }
    // Why: one refresh at a time; instabox rotates refresh tokens and treats reuse as theft.
    refreshing ??= refresh(session).finally(() => {
      refreshing = null
    })
    return (await refreshing).tokens.accessToken
  }
}
