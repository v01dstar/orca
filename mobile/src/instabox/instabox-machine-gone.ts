// Fork: the tunnel is often first to learn a machine was deleted elsewhere (phone, CLI, dashboard);
// listeners drop its host. No react-native imports: the transport loads this.
import { InstaboxApiError } from '../../../src/shared/instabox/instabox-api-client'

type Listener = (machineId: string) => void
const listeners = new Set<Listener>()

export function onInstaboxMachineGone(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reports the machine as deleted when instabox itself answered 404 for it. */
export function reportIfInstaboxMachineGone(machineId: string, error: unknown): void {
  // http_error is a non-API 404 (proxy page), which says nothing about the machine.
  if (error instanceof InstaboxApiError && error.status === 404 && error.code !== 'http_error') {
    for (const listener of listeners) {
      listener(machineId)
    }
  }
}
