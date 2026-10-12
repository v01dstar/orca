import { describe, expect, it, vi } from 'vitest'
import type { SshConnection } from './ssh-connection'
import type { HostRelayEndpointCensus } from './ssh-host-relay-endpoint-census'
import { endOldRelayTerminals, type EndOldRelayTerminalsDeps } from './ssh-old-relay-terminals-end'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the deps never touch the connection; it is an opaque token here.
const conn = {} as SshConnection

function deps(
  census: HostRelayEndpointCensus | (() => Promise<HostRelayEndpointCensus>),
  connect: () => Promise<unknown> = async () => null
): EndOldRelayTerminalsDeps & {
  stop: ReturnType<typeof vi.fn<EndOldRelayTerminalsDeps['stop']>>
  connect: ReturnType<typeof vi.fn<EndOldRelayTerminalsDeps['connect']>>
} {
  return {
    onHost: (run) => run(conn),
    census: typeof census === 'function' ? census : async () => census,
    remoteHome: async () => '/home/me',
    stop: vi.fn<EndOldRelayTerminalsDeps['stop']>(async (_conn, _home, pids) => ({
      ended: pids,
      stillRunning: [],
      skipped: []
    })),
    connect: vi.fn<EndOldRelayTerminalsDeps['connect']>(connect)
  }
}

describe('endOldRelayTerminals', () => {
  it('ends exactly the relay pids a live census found, then reconnects', async () => {
    const d = deps({
      verdict: 'live',
      count: 2,
      oldRelays: { hostOs: 'posix', pids: [4101, 4102] }
    })

    await expect(endOldRelayTerminals(d)).resolves.toEqual({ ended: 2, connected: true })
    expect(d.stop).toHaveBeenCalledWith(conn, '/home/me', [4101, 4102])
    expect(d.connect).toHaveBeenCalledTimes(1)
    expect(d.stop.mock.invocationCallOrder[0]).toBeLessThan(d.connect.mock.invocationCallOrder[0])
  })

  it('stops nothing when the census is unverifiable; the reconnect republishes the refusal', async () => {
    const d = deps(
      { verdict: 'unverifiable', count: 1, oldRelays: { hostOs: 'posix', pids: [4101] } },
      async () => {
        throw new Error('Terminals started by an older version of Orca are still running')
      }
    )

    await expect(endOldRelayTerminals(d)).resolves.toEqual({
      ended: 0,
      connected: false,
      error: 'Terminals started by an older version of Orca are still running'
    })
    expect(d.stop).not.toHaveBeenCalled()
    expect(d.connect).toHaveBeenCalledTimes(1)
  })

  it('never signals a Windows host', async () => {
    const d = deps({ verdict: 'live', count: 1, oldRelays: { hostOs: 'windows', pids: [] } })

    await endOldRelayTerminals(d)
    expect(d.stop).not.toHaveBeenCalled()
  })

  it('stops nothing when the live census could not name any relay process', async () => {
    const d = deps({ verdict: 'live', count: 1, oldRelays: { hostOs: 'posix', pids: [] } })

    await endOldRelayTerminals(d)
    expect(d.stop).not.toHaveBeenCalled()
  })

  it('still reconnects when the census itself fails', async () => {
    const d = deps(async () => {
      throw new Error('transport closed')
    })

    await expect(endOldRelayTerminals(d)).resolves.toEqual({ ended: 0, connected: true })
    expect(d.stop).not.toHaveBeenCalled()
    expect(d.connect).toHaveBeenCalledTimes(1)
  })
})
