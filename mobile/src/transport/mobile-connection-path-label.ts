import { hangarMachineIdOf } from '../hangar/hangar-lazy-websocket'
import type { MobileConnectionPath } from './stable-logical-rpc-client'

export function mobileConnectionPathLabel(path: MobileConnectionPath, endpoint?: string): string {
  // Fork: a hangar host dials a hangar tunnel, which the transport reports as a direct path.
  if (endpoint && hangarMachineIdOf(endpoint)) {
    return 'Via hangar'
  }
  if (path === 'relay') {
    return 'Orca Relay'
  }
  return path === 'tailscale' ? 'Direct · Tailscale' : 'Direct · LAN'
}
