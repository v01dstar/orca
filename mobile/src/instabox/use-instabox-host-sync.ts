// Fork: keeps the home host list in step with the Instabox server while the app runs.
import { useEffect, useRef } from 'react'
import { useForgetHostClient } from '../transport/client-context'
import { removeHostAndCloseClient } from '../transport/host-removal-lifecycle'
import { loadHosts } from '../transport/host-store'
import { instaboxHostIdFor, syncInstaboxHosts } from './instabox-host-sync'
import { onInstaboxMachineGone } from './instabox-machine-gone'

export function useInstaboxHostSync(onHostsChanged: () => void): void {
  const forgetHostClient = useForgetHostClient()
  const changed = useRef(onHostsChanged)
  changed.current = onHostsChanged

  useEffect(() => {
    void syncInstaboxHosts(forgetHostClient)
      .then((didChange) => didChange && changed.current())
      .catch(() => undefined)
    return onInstaboxMachineGone((machineId) => {
      const hostId = instaboxHostIdFor(machineId)
      void loadHosts()
        .then(async (hosts) => {
          if (hosts.some((host) => host.id === hostId)) {
            await removeHostAndCloseClient(hostId, forgetHostClient)
            changed.current()
          }
        })
        .catch(() => undefined)
    })
  }, [forgetHostClient])
}
