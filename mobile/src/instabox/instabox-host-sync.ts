// Fork: an Instabox host is its machine, and the Instabox server is the source of truth. Removing
// the host deletes the machine; hosts whose machine the server no longer lists are dropped, and
// running Orca machines become hosts.
import { InstaboxApiError } from '../../../src/shared/instabox/instabox-api-client'
import {
  instaboxOrcaMachines,
  migrateInstaboxServerUrl
} from '../../../src/shared/instabox/instabox-api-types'
import { removeHostAndCloseClient } from '../transport/host-removal-lifecycle'
import type { HostProfile } from '../transport/types'
import { loadHosts } from '../transport/host-store'
import { addInstaboxMachineAsHost } from './instabox-host-enrollment'
import {
  instaboxHostIdFor,
  machineIdOfHost,
  registerInstaboxMachineDeleter
} from './instabox-host-identity'
import { INSTABOX_ENDPOINT_SCHEME, instaboxMachineIdOf } from './instabox-lazy-websocket'
import { instaboxClient, loadInstaboxSession } from './instabox-mobile-session'

export { instaboxHostIdFor } from './instabox-host-identity'

registerInstaboxMachineDeleter(async (machineId) => {
  if (!(await loadInstaboxSession())) {
    throw new Error('Sign in to Instabox to delete this machine.')
  }
  await instaboxClient()
    .deleteMachine(machineId)
    .catch((error: unknown) => {
      // Already deleted elsewhere is the outcome asked for.
      if (!(error instanceof InstaboxApiError && error.status === 404)) {
        throw error
      }
    })
})

/** Instabox hosts on this server whose machine the server no longer lists. */
export function staleInstaboxHosts(
  hosts: readonly HostProfile[],
  serverUrl: string,
  machineIds: ReadonlySet<string>
): HostProfile[] {
  const serverHost = new URL(serverUrl).host
  return hosts.filter((host) => {
    const machineId = machineIdOfHost(host.id)
    if (!machineId || machineIds.has(machineId) || !instaboxMachineIdOf(host.endpoint)) {
      return false
    }
    const endpointHost = host.endpoint.slice(`${INSTABOX_ENDPOINT_SCHEME}//`.length).split('/')[0]
    // Why migrate: hosts saved before the domain move still name the retired host.
    return new URL(migrateInstaboxServerUrl(`https://${endpointHost}`)).host === serverHost
  })
}

// Machines added (or being added) to Orca automatically this app session. Once per session, so a
// failure leaves the Add to Orca button instead of retrying on every refresh.
const autoAdded = new Set<string>()

/** Claims a machine for automatic adding; false when this session already tried it. */
export function claimInstaboxAutoAdd(machineId: string): boolean {
  if (autoAdded.has(machineId)) {
    return false
  }
  autoAdded.add(machineId)
  return true
}

/**
 * Mirrors the server into the host list: drops hosts of deleted machines and adds running Orca
 * machines. True when the host list changed.
 */
export async function syncInstaboxHosts(
  forgetHostClient: (hostId: string) => void
): Promise<boolean> {
  const session = await loadInstaboxSession()
  if (!session) {
    return false
  }
  const client = instaboxClient()
  const [machines, templates, hosts] = await Promise.all([
    client.listMachines(),
    client.templates(),
    loadHosts()
  ])
  const stale = staleInstaboxHosts(hosts, session.serverUrl, new Set(machines.map((m) => m.id)))
  for (const host of stale) {
    await removeHostAndCloseClient(host.id, forgetHostClient)
  }
  const hostIds = new Set(hosts.map((host) => host.id))
  let added = false
  for (const machine of instaboxOrcaMachines(machines, templates)) {
    if (
      machine.state === 'running' &&
      !hostIds.has(instaboxHostIdFor(machine.id)) &&
      claimInstaboxAutoAdd(machine.id)
    ) {
      added =
        (await addInstaboxMachineAsHost(machine).then(
          () => true,
          () => false
        )) || added
    }
  }
  return stale.length > 0 || added
}
