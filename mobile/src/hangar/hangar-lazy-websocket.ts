// Fork: a hangar host's endpoint is `hangar://<server>/<machineId>`. A hangar tunnel ticket works
// for one socket, so each socket resolves a fresh one before dialing. React Native cannot run the
// desktop's loopback proxy, so this stands in for the WebSocket the transport constructs.

export const HANGAR_ENDPOINT_SCHEME = 'hangar:'

export function hangarEndpointFor(serverUrl: string, machineId: string): string {
  return `hangar://${new URL(serverUrl).host}/${encodeURIComponent(machineId)}`
}

export function hangarMachineIdOf(endpoint: string): string | null {
  if (!endpoint.startsWith(`${HANGAR_ENDPOINT_SCHEME}//`)) {
    return null
  }
  const id = endpoint.slice(endpoint.indexOf('/', `${HANGAR_ENDPOINT_SCHEME}//`.length) + 1)
  return id ? decodeURIComponent(id) : null
}

type Handler<E> = ((event: E) => void) | null

// The WebSocket surface RpcClientSocketSession and the reachability probe use.
class HangarLazyWebSocket {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  onopen: Handler<Event> = null
  onmessage: Handler<MessageEvent> = null
  onclose: Handler<{ code: number; reason: string }> = null
  onerror: Handler<{ message?: string }> = null
  binaryType: BinaryType = 'blob'
  private real: WebSocket | null = null
  private closedEarly = false

  constructor(machineId: string) {
    void this.dial(machineId)
  }

  get readyState(): number {
    return this.real?.readyState ?? (this.closedEarly ? this.CLOSED : this.CONNECTING)
  }

  get bufferedAmount(): number {
    return this.real?.bufferedAmount ?? 0
  }

  send(data: Parameters<WebSocket['send']>[0]): void {
    if (!this.real) {
      throw new Error('hangar socket is not open yet')
    }
    this.real.send(data)
  }

  close(code?: number, reason?: string): void {
    if (this.real) {
      this.real.close(code, reason)
      return
    }
    if (!this.closedEarly) {
      this.closedEarly = true
      this.onclose?.({ code: code ?? 1000, reason: reason ?? '' })
    }
  }

  private async dial(machineId: string): Promise<void> {
    let endpoint: string
    try {
      // Why dynamic: the session pulls in react-native; transport code and its tests must not.
      const { hangarClient, loadHangarSession } = await import('./hangar-mobile-session')
      // Why: after an app restart nothing else may have read the stored session yet.
      await loadHangarSession()
      endpoint = (await hangarClient().createOrcaConnection(machineId, 'mobile')).endpoint
    } catch (error) {
      if (!this.closedEarly) {
        this.closedEarly = true
        const message = error instanceof Error ? error.message : 'hangar unavailable'
        this.onerror?.({ message })
        // Why: 1013 (try again later); the transport backs off as for any dropped dial.
        this.onclose?.({ code: 1013, reason: message })
      }
      return
    }
    if (this.closedEarly) {
      return
    }
    const ws = new WebSocket(endpoint)
    ws.binaryType = this.binaryType
    ws.onopen = (event) => this.onopen?.(event)
    ws.onmessage = (event) => this.onmessage?.(event)
    ws.onclose = (event) => this.onclose?.({ code: event.code, reason: event.reason })
    // RN's error event carries `message`; the DOM type does not declare it.
    ws.onerror = (event) =>
      this.onerror?.({ message: 'message' in event ? String(event.message) : undefined })
    this.real = ws
  }
}

/** The transport's socket constructor: a hangar endpoint dials through a fresh tunnel ticket. */
export function createRuntimeWebSocket(endpoint: string): WebSocket {
  const machineId = hangarMachineIdOf(endpoint)
  if (!machineId) {
    return new WebSocket(endpoint)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: HangarLazyWebSocket implements every WebSocket member the transport and reachability probe touch (readyState, send, close, bufferedAmount, binaryType, on* handlers, state constants).
  return new HangarLazyWebSocket(machineId) as unknown as WebSocket
}
