// Fork: removing an Instabox host deletes its machine on the server first, so if the server
// refuses, the host stays and nothing claims a deletion that did not happen.
import { removeHostAndCloseClient } from '../transport/host-removal-lifecycle'
import { deleteMachineBehindHost } from './instabox-host-identity'

export async function removeHostEverywhere(
  hostId: string,
  forgetHostClient: (hostId: string) => void
): Promise<void> {
  await deleteMachineBehindHost(hostId)
  await removeHostAndCloseClient(hostId, forgetHostClient)
}
