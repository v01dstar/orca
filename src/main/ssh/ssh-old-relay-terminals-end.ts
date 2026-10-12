/**
 * The user's "End old terminals on this host": stop the relay daemons an older Orca left running,
 * then reconnect so the connect's own census proves them gone and converts the host.
 *
 * Only a fresh census that proves relay terminals `live` authorizes the stop; `unverifiable`
 * stops nothing and the reconnect republishes its refusal with the manual command
 * (docs/reference/ssh-execution-boundary.md). Windows hosts are never signalled from here.
 */
import type { SshEndOldRelayTerminalsResult } from '../../shared/ssh-types'
import { errorMessage } from '../../shared/error-message'
import type { SshConnection } from './ssh-connection'
import type { HostRelayEndpointCensus } from './ssh-host-relay-endpoint-census'
import type { OldRelayStopResult } from './ssh-old-relay-daemons'

export type EndOldRelayTerminalsDeps = {
  onHost: <T>(run: (conn: SshConnection) => Promise<T>) => Promise<T>
  census: (conn: SshConnection) => Promise<HostRelayEndpointCensus>
  remoteHome: (conn: SshConnection) => Promise<string | null>
  stop: (conn: SshConnection, remoteHome: string, pids: number[]) => Promise<OldRelayStopResult>
  /** The normal connect, which re-runs the census and converts or republishes the refusal. */
  connect: () => Promise<unknown>
}

export async function endOldRelayTerminals(
  deps: EndOldRelayTerminalsDeps
): Promise<SshEndOldRelayTerminalsResult> {
  const ended = await deps
    .onHost(async (conn) => {
      const census = await deps.census(conn)
      const oldRelays = census.oldRelays
      if (census.verdict !== 'live' || oldRelays?.hostOs !== 'posix' || !oldRelays.pids.length) {
        return 0
      }
      const remoteHome = await deps.remoteHome(conn)
      if (!remoteHome) {
        return 0
      }
      const result = await deps.stop(conn, remoteHome, oldRelays.pids)
      console.log(
        `[ssh] Ended old relay processes: ended=${result.ended.join(',') || 'none'} ` +
          `stillRunning=${result.stillRunning.join(',') || 'none'} ` +
          `skipped=${result.skipped.join(',') || 'none'}`
      )
      return result.ended.length
    })
    .catch((error: unknown) => {
      console.warn('[ssh] Could not end old relay terminals; the reconnect decides:', error)
      return 0
    })
  try {
    await deps.connect()
    return { ended, connected: true }
  } catch (error) {
    return { ended, connected: false, error: errorMessage(error) }
  }
}
