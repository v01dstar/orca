// Access tokens for a stored hangar session, refreshed one at a time (desktop and mobile).
import { createHangarApiClient, HangarApiError } from './hangar-api-client'
import type { HangarTokens } from './hangar-api-types'

export type HangarStoredSession = { serverUrl: string; login: string; tokens: HangarTokens }

// Why: refresh a minute early so a request never leaves with a token that expires in flight.
const REFRESH_SKEW_MS = 60_000

export type HangarSessionHolder = {
  current(): HangarStoredSession | null
  /** The refreshed session, or null when hangar rejected the refresh token (signed out). */
  replace(next: HangarStoredSession | null): void
}

export function createHangarTokenSource(
  holder: HangarSessionHolder,
  fetchImpl?: typeof fetch
): (forceRefresh: boolean) => Promise<string> {
  let refreshing: Promise<HangarStoredSession> | null = null

  async function refresh(session: HangarStoredSession): Promise<HangarStoredSession> {
    try {
      const tokens = await createHangarApiClient({ baseUrl: session.serverUrl, fetchImpl }).refresh(
        session.tokens.refreshToken
      )
      const next = { ...session, tokens }
      // Why: a sign-out or new sign-in during the request wins; do not resurrect the old session.
      if (holder.current() === session) {
        holder.replace(next)
      }
      return next
    } catch (error) {
      const rejected =
        error instanceof HangarApiError && (error.status === 401 || error.status === 403)
      if (rejected && holder.current() === session) {
        holder.replace(null)
      }
      throw error
    }
  }

  return async (forceRefresh) => {
    const session = holder.current()
    if (!session) {
      throw new HangarApiError(401, 'unauthenticated', 'Sign in to hangar first.')
    }
    if (
      !forceRefresh &&
      Date.parse(session.tokens.accessExpiresAt) - Date.now() > REFRESH_SKEW_MS
    ) {
      return session.tokens.accessToken
    }
    // Why: one refresh at a time; hangar rotates refresh tokens and treats reuse as theft.
    refreshing ??= refresh(session).finally(() => {
      refreshing = null
    })
    return (await refreshing).tokens.accessToken
  }
}
