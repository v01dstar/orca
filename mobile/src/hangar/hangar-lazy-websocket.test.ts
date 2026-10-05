import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createOrcaConnection = vi.fn()
vi.mock('./hangar-mobile-session', () => ({
  hangarClient: () => ({ createOrcaConnection })
}))

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 0
  binaryType = 'blob'
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: unknown) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  readonly sent: unknown[] = []
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }
  send(data: unknown): void {
    this.sent.push(data)
  }
  close(): void {}
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('hangar endpoints', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    createOrcaConnection.mockReset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips the machine id and leaves plain endpoints alone', async () => {
    const { createRuntimeWebSocket, hangarEndpointFor, hangarMachineIdOf } =
      await import('./hangar-lazy-websocket')
    const endpoint = hangarEndpointFor('https://152.236.1.51', 'm_abc')
    expect(endpoint).toBe('hangar://152.236.1.51/m_abc')
    expect(hangarMachineIdOf(endpoint)).toBe('m_abc')
    expect(hangarMachineIdOf('ws://10.0.0.2:6768')).toBeNull()
    createRuntimeWebSocket('ws://10.0.0.2:6768')
    expect(FakeWebSocket.instances.map((ws) => ws.url)).toEqual(['ws://10.0.0.2:6768'])
    expect(createOrcaConnection).not.toHaveBeenCalled()
  })

  it('dials a fresh tunnel ticket per socket and relays its events', async () => {
    createOrcaConnection.mockResolvedValue({ endpoint: 'wss://h/v1/tunnels/hgt_1' })
    const { createRuntimeWebSocket } = await import('./hangar-lazy-websocket')
    const socket = createRuntimeWebSocket('hangar://h/m_1')
    const opened = vi.fn()
    socket.onopen = opened
    expect(socket.readyState).toBe(0)
    await flush()
    expect(createOrcaConnection).toHaveBeenCalledWith('m_1', 'mobile')
    const real = FakeWebSocket.instances[0]!
    expect(real.url).toBe('wss://h/v1/tunnels/hgt_1')
    real.readyState = 1
    real.onopen?.({})
    socket.send('hello')
    expect(opened).toHaveBeenCalledOnce()
    expect(real.sent).toEqual(['hello'])
  })

  it('reports 1013 when no ticket can be had, and never dials after an early close', async () => {
    createOrcaConnection.mockRejectedValueOnce(new Error('machine_not_running'))
    const { createRuntimeWebSocket } = await import('./hangar-lazy-websocket')
    const failed = createRuntimeWebSocket('hangar://h/m_1')
    const closed = vi.fn()
    failed.onclose = closed
    await flush()
    expect(closed).toHaveBeenCalledWith({ code: 1013, reason: 'machine_not_running' })
    expect(failed.readyState).toBe(3)

    createOrcaConnection.mockResolvedValueOnce({ endpoint: 'wss://h/v1/tunnels/hgt_2' })
    const early = createRuntimeWebSocket('hangar://h/m_1')
    early.close()
    await flush()
    expect(FakeWebSocket.instances).toEqual([])
  })
})
