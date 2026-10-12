/**
 * The connect path's terminal verdict for a host that may convert to a managed server. The host's
 * own relay endpoints decide, so terminals another desktop opened there still block.
 */
import type { Store } from '../persistence'
import type { HostServerTerminalVerdict } from './ssh-host-server-on-connect'
import {
  censusHostRelayEndpoints,
  type HostRelayEndpointCensus
} from './ssh-host-relay-endpoint-census'
import type { SshConnection } from './ssh-connection'
import { censusWindowsHostRelays, windowsCensusNodePath } from './ssh-host-relay-windows-census'
import { execCommand } from './ssh-relay-deploy-helpers'
import { readRemoteHomeCommand } from './ssh-remote-commands'
import { resolveRemoteNodePath } from './ssh-remote-node-resolution'
import { detectRemoteHostPlatform } from './ssh-remote-platform-detection'
import {
  isWindowsRemoteHost,
  normalizeRemoteHome,
  validateRemoteHome,
  type RemoteHostPlatform
} from './ssh-remote-platform'
import { listOldRelayDaemonPids } from './ssh-old-relay-daemons'
import {
  assessOrcadMigrationTerminals,
  terminalsRunElsewhere,
  type HostRelayTerminalProof
} from './orcad-migration-terminal-gate'

export async function relayTerminalsOnConnect(args: {
  store: Pick<Store, 'getSshRemotePtyLeases'>
  targetId: string
  censusHost: () => Promise<HostRelayEndpointCensus>
}): Promise<HostServerTerminalVerdict> {
  let oldRelays: HostRelayEndpointCensus['oldRelays']
  const proof = await assessOrcadMigrationTerminals(args.store, args.targetId, async () => {
    const census = await args.censusHost()
    oldRelays = census.oldRelays
    return hostTerminalProofFromCensus(census)
  })
  return proof.verdict === 'exited'
    ? { verdict: 'exited', count: 0 }
    : {
        verdict: proof.verdict,
        count: proof.ptyIds.length || (proof.hostTerminals ?? 0),
        ...(terminalsRunElsewhere(proof) ? { elsewhere: true } : {}),
        ...(oldRelays ? { oldRelays } : {})
      }
}

/** Only a listing that found no endpoint, or only idle ones, proves exit; `unenumerable` does not. */
export function hostTerminalProofFromCensus(
  census: HostRelayEndpointCensus
): HostRelayTerminalProof {
  if (census.verdict === 'none' || census.verdict === 'idle') {
    return { verdict: 'exited', count: 0 }
  }
  return { verdict: census.verdict === 'live' ? 'live' : 'unverifiable', count: census.count }
}

/** The host's platform and home, read the way every census reads them; null when unproven. */
export async function readCensusHost(
  conn: SshConnection,
  signal?: AbortSignal
): Promise<{ host: RemoteHostPlatform; remoteHome: string } | null> {
  const host = await detectRemoteHostPlatform(conn, { signal })
  if (!host) {
    return null
  }
  const remoteHome = normalizeRemoteHome(
    await execCommand(conn, readRemoteHomeCommand(host), {
      signal,
      wrapCommand: !isWindowsRemoteHost(host)
    }),
    host
  )
  return validateRemoteHome(remoteHome, host) ? { host, remoteHome } : null
}

/** The census over the connect's bootstrap connection, before any relay session exists. */
export async function censusSshHostRelaysBeforeSession(
  conn: SshConnection,
  targetId: string,
  signal?: AbortSignal
): Promise<HostRelayEndpointCensus> {
  const read = await readCensusHost(conn, signal)
  if (!read) {
    return { verdict: 'unverifiable', count: 0 }
  }
  const { host, remoteHome } = read
  if (isWindowsRemoteHost(host)) {
    const census = await censusWindowsHostRelays(conn, {
      host,
      remoteHome,
      targetId,
      nodePath: () => windowsCensusNodePath(conn, host, remoteHome, signal),
      signal
    })
    return blocksConversion(census)
      ? { ...census, oldRelays: { hostOs: 'windows', pids: [] } }
      : census
  }
  const census = await censusHostRelayEndpoints(conn, {
    host,
    remoteHome,
    fallbackNodePath: () => resolveRemoteNodePath(conn, host, { signal }),
    signal
  })
  if (!blocksConversion(census)) {
    return census
  }
  const pids = await listOldRelayDaemonPids(conn, remoteHome, signal)
  return { ...census, oldRelays: { hostOs: 'posix', pids: pids ?? [] } }
}

function blocksConversion(census: HostRelayEndpointCensus): boolean {
  return census.verdict !== 'none' && census.verdict !== 'idle'
}
