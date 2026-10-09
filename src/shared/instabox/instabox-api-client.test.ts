import { describe, expect, it, vi } from 'vitest'
import { createInstaboxApiClient, InstaboxApiError } from './instabox-api-client'

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

describe('createInstaboxApiClient', () => {
  const tokens = {
    accessToken: 'iba_a',
    accessExpiresAt: '2026-10-08T00:00:00Z',
    refreshToken: 'ibr_r',
    refreshExpiresAt: '2026-11-08T00:00:00Z'
  }
  const deviceStart = {
    deviceCode: 'ibd_1',
    userCode: 'ABCD-1234',
    verificationUri: 'https://github.com/login/device',
    interval: 0,
    expiresIn: 900
  }

  it('keeps polling the device flow through a request iOS killed in the background', async () => {
    const { calls, fetchImpl } = fakeFetch([
      new TypeError('Network request failed'),
      json(400, { error: { code: 'authorization_pending', message: 'waiting' } }),
      json(200, tokens)
    ])
    const client = createInstaboxApiClient({ baseUrl: 'https://h.test', fetchImpl })

    expect(await client.waitForDeviceLogin(deviceStart)).toEqual(tokens)
    expect(calls).toHaveLength(3)
  })

  it('stops polling the device flow when authorization is denied', async () => {
    const { fetchImpl } = fakeFetch([
      json(400, { error: { code: 'access_denied', message: 'denied' } })
    ])
    const client = createInstaboxApiClient({ baseUrl: 'https://h.test', fetchImpl })

    await expect(client.waitForDeviceLogin(deviceStart)).rejects.toMatchObject({
      code: 'access_denied'
    })
  })

  it('retries once with a refreshed token after a 401', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json(401, { error: { code: 'unauthenticated', message: 'expired' } }),
      json(200, { userId: 7, login: 'me' })
    ])
    const getAccessToken = vi.fn(async (force: boolean) => (force ? 'fresh' : 'stale'))
    const client = createInstaboxApiClient({
      baseUrl: 'https://h.test/',
      getAccessToken,
      fetchImpl
    })

    expect(await client.me()).toMatchObject({ login: 'me' })
    expect(calls.map((c) => header(c, 'Authorization'))).toEqual(['Bearer stale', 'Bearer fresh'])
    expect(calls[0]?.url).toBe('https://h.test/v1/me')
  })

  it('reuses the idempotency key when a mutation response is lost', async () => {
    const { calls, fetchImpl } = fakeFetch([
      new TypeError('socket hang up'),
      json(202, operation('queued'))
    ])
    const client = createInstaboxApiClient({
      baseUrl: 'https://h.test',
      getAccessToken: async () => 't',
      fetchImpl
    })

    await client.machineAction('m_1', 'start')
    expect(calls).toHaveLength(2)
    expect(header(calls[0], 'Idempotency-Key')).toMatch(/^[0-9a-f]{32}$/)
    expect(header(calls[1], 'Idempotency-Key')).toBe(header(calls[0], 'Idempotency-Key'))
  })

  it('surfaces instabox error bodies and does not retry them', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json(409, { error: { code: 'machine_not_running', message: 'start it', retryable: false } })
    ])
    const client = createInstaboxApiClient({
      baseUrl: 'https://h.test',
      getAccessToken: async () => 't',
      fetchImpl
    })

    const error = await client.createOrcaConnection('m_1', 'runtime').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InstaboxApiError)
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
    const client = createInstaboxApiClient({
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
    const client = createInstaboxApiClient({ baseUrl: 'https://h.test', fetchImpl: fetch })
    await expect(client.listMachines()).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})

describe('instabox snapshots', () => {
  const snapshot = {
    id: 'im_1',
    name: 'orca-base',
    template: { id: 'orca', version: '2026-10-05.1', digest: 'sha256:x' },
    createdAt: '2026-10-06T00:00:00Z'
  }

  it('lists snapshots and saves a stopped machine as one', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json(200, { snapshots: [snapshot] }),
      json(201, snapshot)
    ])
    const client = createInstaboxApiClient({
      baseUrl: 'https://h.test',
      getAccessToken: async () => 't',
      fetchImpl
    })

    expect((await client.listSnapshots()).map((i) => i.name)).toEqual(['orca-base'])
    expect(await client.createSnapshot('m_1', 'orca-base')).toMatchObject({ id: 'im_1' })
    expect(calls.map((c) => c.url)).toEqual([
      'https://h.test/v1/snapshots',
      'https://h.test/v1/machines/m_1/snapshots'
    ])
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ name: 'orca-base' })
    expect(header(calls[1], 'Idempotency-Key')).toBeTruthy()
  })
})
