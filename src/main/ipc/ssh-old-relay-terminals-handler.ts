/** `ssh:endOldRelayTerminals`: stop an older Orca's relay terminals on a host, then reconnect. */
import type { SshEndOldRelayTerminalsResult } from '../../shared/ssh-types'
import { getSshTargetRegistryStore } from '../ssh/ssh-target-registry'
import { assertSshConnectsNotFenced, connectInFlight } from './ssh-connect-attempt-registry'
import { connectTarget } from './ssh-connect-flow'

const endInFlight = new Map<string, Promise<SshEndOldRelayTerminalsResult>>()

export function endOldRelayTerminalsForTarget(
  targetId: string
): Promise<SshEndOldRelayTerminalsResult> {
  const existing = endInFlight.get(targetId)
  if (existing) {
    return existing
  }
  const target = getSshTargetRegistryStore()!.getTarget(targetId)
  if (!target) {
    return Promise.reject(new Error(`SSH target "${targetId}" not found`))
  }
  const run = (async () => {
    // A connect still deciding owns the transport; its refusal is what this action answers.
    await connectInFlight.get(targetId)?.promise.catch(() => {})
    assertSshConnectsNotFenced()
    // Why lazy: the census graph loads only when a host needs it, as on connect.
    const [census, transport, daemons, action] = await Promise.all([
      import('../ssh/ssh-host-relay-terminals-on-connect'),
      import('../ssh/ssh-host-relay-census-for-target'),
      import('../ssh/ssh-old-relay-daemons'),
      import('../ssh/ssh-old-relay-terminals-end')
    ])
    return action.endOldRelayTerminals({
      onHost: (runOnHost) => transport.runOnSshHostCensusTransport(target, runOnHost),
      census: (conn) => census.censusSshHostRelaysBeforeSession(conn, targetId),
      remoteHome: async (conn) => (await census.readCensusHost(conn))?.remoteHome ?? null,
      stop: (conn, remoteHome, pids) => daemons.endOldRelayDaemons(conn, remoteHome, pids),
      connect: () => connectTarget(targetId)
    })
  })().finally(() => {
    endInFlight.delete(targetId)
  })
  endInFlight.set(targetId, run)
  return run
}
