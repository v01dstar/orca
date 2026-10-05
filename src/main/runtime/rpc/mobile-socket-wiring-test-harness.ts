// Fake ws socket and mobile transport for MobileSocketWiring tests.
import { vi, type Mock } from 'vitest'
import type { WebSocket } from 'ws'
import type { MobileSocketTransport } from './mobile-socket-wiring'

export class FakeSocket {
  readonly OPEN = 1
  readyState = this.OPEN
  bufferedAmount = 0
  readonly sent: (string | Buffer)[] = []
  readonly send: Mock<(data: string | Buffer) => number> = vi.fn((data: string | Buffer) =>
    this.sent.push(data)
  )
  readonly close: Mock<(code?: number, reason?: string) => void> = vi.fn()
}

export class FakeTransport implements MobileSocketTransport {
  private messageHandler: Parameters<MobileSocketTransport['onMessage']>[0] | null = null
  private closeHandler: Parameters<MobileSocketTransport['onConnectionClose']>[0] | null = null
  readonly setClientId: Mock<MobileSocketTransport['setClientId']> = vi.fn()
  readonly terminateClientConnections: Mock<MobileSocketTransport['terminateClientConnections']> =
    vi.fn(() => 0)

  onMessage(handler: Parameters<MobileSocketTransport['onMessage']>[0]): void {
    this.messageHandler = handler
  }

  onConnectionClose(handler: Parameters<MobileSocketTransport['onConnectionClose']>[0]): void {
    this.closeHandler = handler
  }

  receive(ws: FakeSocket, message: string): void {
    this.messageHandler?.(message, vi.fn(), ws as unknown as WebSocket)
  }

  disconnect(ws: FakeSocket): void {
    this.closeHandler?.(null, ws as unknown as WebSocket, false)
  }
}
