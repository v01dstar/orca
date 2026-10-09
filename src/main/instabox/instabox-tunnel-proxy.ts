// Loopback front for instabox machines. A instabox tunnel ticket works for one socket, while Orca's
// connection code dials a stored endpoint; this server is that endpoint. Each accepted socket
// gets a fresh ticket and is spliced to the machine's tunnel. Frames pass through untouched:
// they are E2EE between Orca and the runtime.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import WebSocket, { WebSocketServer, type RawData } from 'ws'

export type InstaboxTunnelResolver = (machineId: string) => Promise<{ endpoint: string }>

// Close codes a peer may send (1005, 1006 and 1015 are reserved for local reporting).
function sendableCloseCode(code: number): number {
  return code === 1000 ||
    (code >= 3000 && code <= 4999) ||
    (code >= 1001 && code <= 1014 && code !== 1005 && code !== 1006)
    ? code
    : 1011
}

export class InstaboxTunnelProxy {
  private server: WebSocketServer | null = null
  private port = 0
  // Why: the path secret keeps other local processes from using the signed-in instabox session.
  private readonly secret = randomBytes(24).toString('hex')

  constructor(private readonly resolveTunnel: InstaboxTunnelResolver) {}

  async start(): Promise<void> {
    if (this.server) {
      return
    }
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    this.port = typeof address === 'object' && address ? address.port : 0
    server.on('connection', (client, request) => this.accept(client, request))
    this.server = server
  }

  stop(): void {
    this.server?.close()
    for (const client of this.server?.clients ?? []) {
      client.terminate()
    }
    this.server = null
  }

  endpointFor(machineId: string): string {
    if (!this.server) {
      throw new Error('instabox tunnel proxy is not running')
    }
    return `ws://127.0.0.1:${this.port}/instabox/${this.secret}/${encodeURIComponent(machineId)}`
  }

  private machineIdOf(request: IncomingMessage): string | null {
    const [, prefix, secret, machineId, ...rest] = (request.url ?? '').split('/')
    const expected = Buffer.from(this.secret)
    const given = Buffer.from(secret ?? '')
    if (
      prefix !== 'instabox' ||
      rest.length > 0 ||
      !machineId ||
      given.length !== expected.length
    ) {
      return null
    }
    return timingSafeEqual(given, expected) ? decodeURIComponent(machineId) : null
  }

  private accept(client: WebSocket, request: IncomingMessage): void {
    const machineId = this.machineIdOf(request)
    if (!machineId) {
      client.close(1008, 'unknown instabox endpoint')
      return
    }
    const pending: { data: RawData; isBinary: boolean }[] = []
    let upstream: WebSocket | null = null
    client.on('message', (data, isBinary) => {
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary })
      } else {
        pending.push({ data, isBinary })
      }
    })
    client.on('close', (code, reason) => upstream?.close(sendableCloseCode(code), reason))
    client.on('error', () => upstream?.terminate())
    void this.resolveTunnel(machineId).then(
      ({ endpoint }) => {
        if (client.readyState !== WebSocket.OPEN) {
          return
        }
        const ws = new WebSocket(endpoint)
        upstream = ws
        ws.on('open', () => {
          for (const frame of pending.splice(0)) {
            ws.send(frame.data, { binary: frame.isBinary })
          }
        })
        ws.on('message', (data, isBinary) => client.send(data, { binary: isBinary }))
        ws.on('close', (code, reason) => client.close(sendableCloseCode(code), reason))
        ws.on('error', () => client.terminate())
      },
      (error: unknown) => {
        // Why: 1013 (try again later) — clients back off and retry, e.g. while a machine starts.
        const reason = error instanceof Error ? error.message.slice(0, 120) : 'instabox unavailable'
        client.close(1013, reason)
      }
    )
  }
}
