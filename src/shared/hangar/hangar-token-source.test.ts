import { describe, expect, it } from 'vitest'
import { createHangarTokenSource, type HangarStoredSession } from './hangar-token-source'

const soon = (ms: number): string => new Date(Date.now() + ms).toISOString()
const session = (accessToken: string, expiresInMs: number): HangarStoredSession => ({
  serverUrl: 'https://h.test',
  login: 'me',
  tokens: {
    accessToken,
    accessExpiresAt: soon(expiresInMs),
    refreshToken: `r-${accessToken}`,
    refreshExpiresAt: soon(3_600_000)
  }
})

function holderWith(initial: HangarStoredSession | null) {
  let current = initial
  const replaced: (HangarStoredSession | null)[] = []
  return {
    holder: {
      current: () => current,
      replace: (next: HangarStoredSession | null) => {
        replaced.push(next)
        current = next
      }
    },
    replaced,
    signOut: () => {
      current = null
    }
  }
}

function refreshFetch(status: number, delayMs = 0) {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    const body =
      status === 200
        ? {
            accessToken: `fresh-${calls}`,
            accessExpiresAt: soon(900_000),
            refreshToken: 'r2',
            refreshExpiresAt: soon(3_600_000)
          }
        : { error: { code: 'unauthenticated', message: 'refresh token revoked' } }
    return new Response(JSON.stringify(body), { status })
  }
  return { fetchImpl, calls: () => calls }
}

describe('createHangarTokenSource', () => {
  it('returns a valid token without refreshing, and refreshes once for concurrent callers', async () => {
    const valid = holderWith(session('ok', 600_000))
    const unused = refreshFetch(200)
    expect(await createHangarTokenSource(valid.holder, unused.fetchImpl)(false)).toBe('ok')
    expect(unused.calls()).toBe(0)

    const expiring = holderWith(session('old', 30_000))
    const server = refreshFetch(200, 20)
    const token = createHangarTokenSource(expiring.holder, server.fetchImpl)
    expect(await Promise.all([token(false), token(false), token(true)])).toEqual([
      'fresh-1',
      'fresh-1',
      'fresh-1'
    ])
    expect(server.calls()).toBe(1)
    expect(expiring.replaced.map((s) => s?.tokens.accessToken)).toEqual(['fresh-1'])
  })

  it('signs out when hangar rejects the refresh token', async () => {
    const state = holderWith(session('old', 0))
    const token = createHangarTokenSource(state.holder, refreshFetch(401).fetchImpl)
    await expect(token(false)).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(state.replaced).toEqual([null])
  })

  it('does not resurrect a session signed out during the refresh', async () => {
    const state = holderWith(session('old', 0))
    const token = createHangarTokenSource(state.holder, refreshFetch(200, 30).fetchImpl)
    const pending = token(false)
    state.signOut()
    await pending
    expect(state.replaced).toEqual([])
    expect(state.holder.current()).toBeNull()
  })
})
