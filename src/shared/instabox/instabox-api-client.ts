// instabox API client shared by the desktop main process and mobile: fetch only, so it runs in
// Node and React Native. Mutations carry an Idempotency-Key, reused when a timeout is retried.
import { z } from 'zod'
import {
  InstaboxDeviceStartSchema,
  InstaboxErrorSchema,
  InstaboxSnapshotSchema,
  InstaboxMachineSchema,
  InstaboxMeSchema,
  InstaboxOperationSchema,
  InstaboxOrcaConnectionSchema,
  InstaboxTemplateSchema,
  InstaboxTokensSchema,
  type InstaboxCreateMachineRequest,
  type InstaboxDeviceStart,
  type InstaboxSnapshot,
  type InstaboxMachine,
  type InstaboxMachineAction,
  type InstaboxMe,
  type InstaboxOperation,
  type InstaboxOrcaConnection,
  type InstaboxTemplate,
  type InstaboxTokens
} from './instabox-api-types'

const MachineListSchema = z.object({ machines: InstaboxMachineSchema.array() })
const TemplateListSchema = z.object({ templates: InstaboxTemplateSchema.array() })
const SnapshotListSchema = z.object({ snapshots: InstaboxSnapshotSchema.array() })
const REQUEST_TIMEOUT_MS = 30_000
const OPERATION_POLL_MS = 1_000

export class InstaboxApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'InstaboxApiError'
  }
}

type RequestOptions = { method?: string; body?: unknown; idempotencyKey?: string; auth?: boolean }

export type InstaboxApiClientOptions = {
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

export function createInstaboxApiClient(options: InstaboxApiClientOptions) {
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
      throw new InstaboxApiError(401, 'unauthenticated', 'Not signed in to instabox.')
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
      const parsed = InstaboxErrorSchema.safeParse(
        body && typeof body === 'object' && 'error' in body ? body.error : null
      )
      throw parsed.success
        ? new InstaboxApiError(
            response.status,
            parsed.data.code,
            parsed.data.message,
            parsed.data.retryable
          )
        : new InstaboxApiError(
            response.status,
            'http_error',
            `Instabox returned ${response.status}`
          )
    }
    return schema.parse(body)
  }

  // Why: a mutation whose response was lost is retried once with the same key, so instabox
  // returns the original operation instead of performing it twice.
  async function mutate<T>(schema: z.ZodType<T>, path: string, opts: RequestOptions) {
    const idempotencyKey = randomKey()
    try {
      return await request(schema, path, { ...opts, idempotencyKey })
    } catch (error) {
      if (error instanceof InstaboxApiError) {
        throw error
      }
      return request(schema, path, { ...opts, idempotencyKey })
    }
  }

  const getOperation = (id: string): Promise<InstaboxOperation> =>
    request(InstaboxOperationSchema, `/v1/operations/${encodeURIComponent(id)}`)

  return {
    baseUrl,
    me: (): Promise<InstaboxMe> => request(InstaboxMeSchema, '/v1/me'),
    templates: async (): Promise<InstaboxTemplate[]> =>
      (await request(TemplateListSchema, '/v1/templates')).templates,
    listMachines: async (): Promise<InstaboxMachine[]> =>
      (await request(MachineListSchema, '/v1/machines?limit=200')).machines,
    getMachine: (id: string): Promise<InstaboxMachine> =>
      request(InstaboxMachineSchema, `/v1/machines/${encodeURIComponent(id)}`),
    createMachine: (req: InstaboxCreateMachineRequest): Promise<InstaboxOperation> =>
      mutate(InstaboxOperationSchema, '/v1/machines', { method: 'POST', body: req }),
    machineAction: (id: string, action: InstaboxMachineAction): Promise<InstaboxOperation> =>
      mutate(InstaboxOperationSchema, `/v1/machines/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: {}
      }),
    listSnapshots: async (): Promise<InstaboxSnapshot[]> =>
      (await request(SnapshotListSchema, '/v1/snapshots')).snapshots,
    // The machine must be stopped; saves its root disk and /data (including HOME credentials).
    createSnapshot: (machineId: string, name: string): Promise<InstaboxSnapshot> =>
      mutate(InstaboxSnapshotSchema, `/v1/machines/${encodeURIComponent(machineId)}/snapshots`, {
        method: 'POST',
        body: { name }
      }),
    deleteMachine: (id: string): Promise<InstaboxOperation> =>
      mutate(InstaboxOperationSchema, `/v1/machines/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }),
    getOperation,
    async waitForOperation(
      operation: InstaboxOperation,
      args: { signal?: AbortSignal; onUpdate?: (op: InstaboxOperation) => void } = {}
    ): Promise<InstaboxOperation> {
      let current = operation
      while (current.state === 'queued' || current.state === 'running') {
        await sleep(OPERATION_POLL_MS, args.signal)
        current = await getOperation(current.id)
        args.onUpdate?.(current)
      }
      if (current.state !== 'succeeded') {
        throw new InstaboxApiError(
          409,
          current.error?.code ?? 'operation_failed',
          current.error?.message ?? `instabox ${current.type} ${current.state}`
        )
      }
      return current
    },
    createOrcaConnection: (
      id: string,
      scope: 'runtime' | 'mobile'
    ): Promise<InstaboxOrcaConnection> =>
      request(
        InstaboxOrcaConnectionSchema,
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
    }): Promise<InstaboxTokens> =>
      request(InstaboxTokensSchema, '/v1/auth/cli/token', {
        method: 'POST',
        body: args,
        auth: false
      }),
    startDeviceLogin: (): Promise<InstaboxDeviceStart> =>
      request(InstaboxDeviceStartSchema, '/v1/auth/device', {
        method: 'POST',
        body: {},
        auth: false
      }),
    /** Polls until the user authorizes the device code; rejects when denied or expired. */
    async waitForDeviceLogin(
      start: InstaboxDeviceStart,
      signal?: AbortSignal
    ): Promise<InstaboxTokens> {
      let intervalMs = Math.max(start.interval, 1) * 1000
      const deadline = Date.now() + start.expiresIn * 1000
      for (;;) {
        await sleep(intervalMs, signal)
        try {
          return await request(InstaboxTokensSchema, '/v1/auth/device/token', {
            method: 'POST',
            body: { deviceCode: start.deviceCode },
            auth: false
          })
        } catch (error) {
          if (signal?.aborted) {
            throw error
          }
          // Why: iOS kills in-flight requests while the user approves in the browser; poll again.
          const transient =
            !(error instanceof InstaboxApiError) || (error.retryable && error.status >= 500)
          if (transient && Date.now() < deadline) {
            continue
          }
          if (!(error instanceof InstaboxApiError)) {
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
    refresh: (refreshToken: string): Promise<InstaboxTokens> =>
      request(InstaboxTokensSchema, '/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false
      })
  }
}

export type InstaboxApiClient = ReturnType<typeof createInstaboxApiClient>
