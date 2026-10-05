import { describe, expect, it, vi } from 'vitest'
import { createHangarApiClient, HangarApiError } from './hangar-api-client'

type Call = { url: string; init: RequestInit }

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = []
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses.shift()
    if (!next || next instanceof Error) {
      throw next ?? new Error('no response')
    }
    return next
  }
  return { calls, fetchImpl }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const header = (call: Call | undefined, name: string): string | undefined =>
  new Headers(call?.init.headers).get(name) ?? undefined

const operation = (state: string) => ({ id: 'op_1', machineId: 'm_1', type: 'start', state })

describe('createHangarApiClient', () => {
  it('retries once with a refreshed token after a 401', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json(401, { error: { code: 'unauthenticated', message: 'expired' } }),
      json(200, { userId: 7, login: 'me' })
    ])
    const getAccessToken = vi.fn(async (force: boolean) => (force ? 'fresh' : 'stale'))
    const client = createHangarApiClient({ baseUrl: 'https://h.test/', getAccessToken, fetchImpl })

    expect(await client.me()).toMatchObject({ login: 'me' })
    expect(calls.map((c) => header(c, 'Authorization'))).toEqual(['Bearer stale', 'Bearer fresh'])
    expect(calls[0]?.url).toBe('https://h.test/v1/me')
  })

  it('reuses the idempotency key when a mutation response is lost', async () => {
    const { calls, fetchImpl } = fakeFetch([
      new TypeError('socket hang up'),
      json(202, operation('queued'))
    ])
    const client = createHangarApiClient({
      baseUrl: 'https://h.test',
      getAccessToken: async () => 't',
      fetchImpl
    })

    await client.machineAction('m_1', 'start')
    expect(calls).toHaveLength(2)
    expect(header(calls[0], 'Idempotency-Key')).toMatch(/^[0-9a-f]{32}$/)
    expect(header(calls[1], 'Idempotency-Key')).toBe(header(calls[0], 'Idempotency-Key'))
  })

  it('surfaces hangar error bodies and does not retry them', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json(409, { error: { code: 'machine_not_running', message: 'start it', retryable: false } })
    ])
    const client = createHangarApiClient({
      baseUrl: 'https://h.test',
      getAccessToken: async () => 't',
      fetchImpl
    })

    const error = await client.createOrcaConnection('m_1', 'runtime').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HangarApiError)
    expect(error).toMatchObject({ status: 409, code: 'machine_not_running' })
    expect(calls).toHaveLength(1)
  })

  it('polls an operation until it settles and reports failure', async () => {
    vi.useFakeTimers()
    const { fetchImpl } = fakeFetch([
      json(200, operation('running')),
      json(200, {
        ...operation('failed'),
        error: { code: 'node_unavailable', message: 'host down' }
      })
    ])
    const client = createHangarApiClient({
      baseUrl: 'https://h.test',
      getAccessToken: async () => 't',
      fetchImpl
    })
    const waiting = client.waitForOperation(operation('queued')).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    expect(await waiting).toMatchObject({ code: 'node_unavailable' })
    vi.useRealTimers()
  })

  it('refuses authenticated calls without a token source', async () => {
    const client = createHangarApiClient({ baseUrl: 'https://h.test', fetchImpl: fetch })
    await expect(client.listMachines()).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})
