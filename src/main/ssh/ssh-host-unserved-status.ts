/** What a connect publishes when the managed server doesn't serve the host; there is no fallback. */
import { oldRelayStopCommand } from '../../shared/ssh-old-relay-stop-command'
import type { SshManagedServerStatus, SshOldRelayProcesses } from '../../shared/ssh-types'
import type { HostServerOnConnectResult } from './ssh-host-server-on-connect'

type UnservedDecision = Extract<HostServerOnConnectResult, { route: 'relay' }>

// Why `kind: 'relay'`: the published status keeps its shipped shape; it now means "not served".
export function unservedServerStatus(
  decision: UnservedDecision
): Extract<SshManagedServerStatus, { kind: 'relay' }> {
  return {
    kind: 'relay',
    reason: decision.reason,
    ...(decision.detail ? { detail: decision.detail } : {}),
    ...(decision.terminals !== undefined ? { terminals: decision.terminals } : {}),
    ...(decision.terminalsElsewhere ? { terminalsElsewhere: true } : {}),
    ...(decision.oldRelays ? { oldRelays: decision.oldRelays } : {})
  }
}

/** Untranslated twin of the renderer's status line, for logs and callers without the catalog. */
export function unservedHostServerMessage(decision: UnservedDecision): string {
  switch (decision.reason) {
    case 'orcad_unavailable':
      return 'This SSH host isn’t supported by this version of Orca. To keep using it, install an older version of Orca.'
    case 'relay_terminals_live':
    case 'relay_terminals_unverifiable':
      return `Terminals started by an older version of Orca are still running on this host, and they don’t stop on their own. Close them in that version of Orca or end them on the host, then reconnect.${oldRelayStopHint(decision.oldRelays)}`
    case 'refused':
      return decision.detail ?? 'Orca couldn’t set up its server on this host.'
    case 'source_changed':
      return 'An older version of Orca changed this host’s projects. Move those changes to its managed server in SSH Hosts settings to continue.'
    case 'deferred':
    case 'failed':
      return 'Orca couldn’t start its server on this host. Try connecting again.'
  }
}

function oldRelayStopHint(oldRelays: SshOldRelayProcesses | undefined): string {
  if (!oldRelays) {
    return ''
  }
  const pids = oldRelays.pids.length > 0 ? ` (process IDs ${oldRelays.pids.join(', ')})` : ''
  return ` To end them on the host${pids}, run: ${oldRelayStopCommand(oldRelays.hostOs)}`
}
