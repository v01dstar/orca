// hangar API client shared by the desktop main process and mobile: fetch only, so it runs in
// Node and React Native. Mutations carry an Idempotency-Key, reused when a timeout is retried.
import { z } from 'zod'
import {
  HangarDeviceStartSchema,
  HangarErrorSchema,
  HangarMachineSchema,
  HangarMeSchema,
  HangarOperationSchema,
  HangarOrcaConnectionSchema,
  HangarTemplateSchema,
  HangarTokensSchema,
  type HangarCreateMachineRequest,
  type HangarDeviceStart,
  type HangarMachine,
  type HangarMachineAction,
  type HangarMe,
  type HangarOperation,
  type HangarOrcaConnection,
  type HangarTemplate,
  type HangarTokens
} from './hangar-api-types'

const MachineListSchema = z.object({ machines: HangarMachineSchema.array() })
const TemplateListSchema = z.object({ templates: HangarTemplateSchema.array() })
const REQUEST_TIMEOUT_MS = 30_000
const OPERATION_POLL_MS = 1_000

export class HangarApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'HangarApiError'
  }
}

type RequestOptions = { method?: string; body?: unknown; idempotencyKey?: string; auth?: boolean }

export type HangarApiClientOptions = {
  baseUrl: string
  // forceRefresh: the last access token was rejected (401); return a refreshed one.
  getAccessToken?: (forceRefresh: boolean) => Promise<string>
  fetchImpl?: typeof fetch
  randomKey?: () => string
}

function defaultRandomKey(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

export function createHangarApiClient(options: HangarApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const randomKey = options.randomKey ?? defaultRandomKey

  async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey
    }
    // Why not AbortSignal.timeout: Hermes (mobile) does not implement it.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        redirect: 'error',
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function request<T>(schema: z.ZodType<T>, path: string, opts: RequestOptions = {}) {
    const getToken = opts.auth === false ? undefined : options.getAccessToken
    if (opts.auth !== false && !getToken) {
      throw new HangarApiError(401, 'unauthenticated', 'Not signed in to hangar.')
    }
    let response = await send(path, opts, getToken ? await getToken(false) : null)
    if (getToken && response.status === 401) {
      response = await send(path, opts, await getToken(true))
    }
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON (proxy error page): reported below with the status.
    }
    if (!response.ok) {
      const parsed = HangarErrorSchema.safeParse(
        body && typeof body === 'object' && 'error' in body ? body.error : null
      )
      throw parsed.success
        ? new HangarApiError(
            response.status,
            parsed.data.code,
            parsed.data.message,
            parsed.data.retryable
          )
        : new HangarApiError(response.status, 'http_error', `hangar returned ${response.status}`)
    }
    return schema.parse(body)
  }

  // Why: a mutation whose response was lost is retried once with the same key, so hangar
  // returns the original operation instead of performing it twice.
  async function mutate<T>(schema: z.ZodType<T>, path: string, opts: RequestOptions) {
    const idempotencyKey = randomKey()
    try {
      return await request(schema, path, { ...opts, idempotencyKey })
    } catch (error) {
      if (error instanceof HangarApiError) {
        throw error
      }
      return request(schema, path, { ...opts, idempotencyKey })
    }
  }

  const getOperation = (id: string): Promise<HangarOperation> =>
    request(HangarOperationSchema, `/v1/operations/${encodeURIComponent(id)}`)

  return {
    baseUrl,
    me: (): Promise<HangarMe> => request(HangarMeSchema, '/v1/me'),
    templates: async (): Promise<HangarTemplate[]> =>
      (await request(TemplateListSchema, '/v1/templates')).templates,
    listMachines: async (): Promise<HangarMachine[]> =>
      (await request(MachineListSchema, '/v1/machines?limit=200')).machines,
    getMachine: (id: string): Promise<HangarMachine> =>
      request(HangarMachineSchema, `/v1/machines/${encodeURIComponent(id)}`),
    createMachine: (req: HangarCreateMachineRequest): Promise<HangarOperation> =>
      mutate(HangarOperationSchema, '/v1/machines', { method: 'POST', body: req }),
    machineAction: (id: string, action: HangarMachineAction): Promise<HangarOperation> =>
      mutate(HangarOperationSchema, `/v1/machines/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: {}
      }),
    deleteMachine: (id: string): Promise<HangarOperation> =>
      mutate(HangarOperationSchema, `/v1/machines/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }),
    getOperation,
    async waitForOperation(
      operation: HangarOperation,
      args: { signal?: AbortSignal; onUpdate?: (op: HangarOperation) => void } = {}
    ): Promise<HangarOperation> {
      let current = operation
      while (current.state === 'queued' || current.state === 'running') {
        await sleep(OPERATION_POLL_MS, args.signal)
        current = await getOperation(current.id)
        args.onUpdate?.(current)
      }
      if (current.state !== 'succeeded') {
        throw new HangarApiError(
          409,
          current.error?.code ?? 'operation_failed',
          current.error?.message ?? `hangar ${current.type} ${current.state}`
        )
      }
      return current
    },
    createOrcaConnection: (
      id: string,
      scope: 'runtime' | 'mobile'
    ): Promise<HangarOrcaConnection> =>
      request(
        HangarOrcaConnectionSchema,
        `/v1/machines/${encodeURIComponent(id)}/orca-connections`,
        {
          method: 'POST',
          body: { scope }
        }
      ),
    logout: async (): Promise<void> => {
      await request(z.unknown(), '/v1/auth/logout', { method: 'POST' })
    },
    exchangeCliCode: (args: {
      code: string
      codeVerifier: string
      redirectUri: string
    }): Promise<HangarTokens> =>
      request(HangarTokensSchema, '/v1/auth/cli/token', {
        method: 'POST',
        body: args,
        auth: false
      }),
    startDeviceLogin: (): Promise<HangarDeviceStart> =>
      request(HangarDeviceStartSchema, '/v1/auth/device', {
        method: 'POST',
        body: {},
        auth: false
      }),
    /** Polls until the user authorizes the device code; rejects when denied or expired. */
    async waitForDeviceLogin(
      start: HangarDeviceStart,
      signal?: AbortSignal
    ): Promise<HangarTokens> {
      let intervalMs = Math.max(start.interval, 1) * 1000
      for (;;) {
        await sleep(intervalMs, signal)
        try {
          return await request(HangarTokensSchema, '/v1/auth/device/token', {
            method: 'POST',
            body: { deviceCode: start.deviceCode },
            auth: false
          })
        } catch (error) {
          if (!(error instanceof HangarApiError)) {
            throw error
          }
          if (error.code === 'slow_down') {
            intervalMs += 5000
          } else if (error.code !== 'authorization_pending') {
            throw error
          }
        }
      }
    },
    refresh: (refreshToken: string): Promise<HangarTokens> =>
      request(HangarTokensSchema, '/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false
      })
  }
}

export type HangarApiClient = ReturnType<typeof createHangarApiClient>
