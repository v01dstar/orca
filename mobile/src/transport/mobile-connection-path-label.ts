import { instaboxMachineIdOf } from '../instabox/instabox-lazy-websocket'
import type { MobileConnectionPath } from './stable-logical-rpc-client'

export function mobileConnectionPathLabel(path: MobileConnectionPath, endpoint?: string): string {
  // Fork: an Instabox host dials an Instabox tunnel, which the transport reports as a direct path.
  if (endpoint && instaboxMachineIdOf(endpoint)) {
    return 'Via Instabox'
  }
  if (path === 'relay') {
    return 'Orca Relay'
  }
  return path === 'tailscale' ? 'Direct · Tailscale' : 'Direct · LAN'
}
