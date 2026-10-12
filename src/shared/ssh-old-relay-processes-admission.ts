import type { SshOldRelayProcesses } from './ssh-types'

const MAX_OLD_RELAY_PIDS = 64

// Why alone: a malformed list drops without hiding the refusal it explains.
export function admitSshOldRelayProcesses(value: unknown): { oldRelays?: SshOldRelayProcesses } {
  if (!value || typeof value !== 'object' || !('hostOs' in value) || !('pids' in value)) {
    return {}
  }
  const hostOs = value.hostOs === 'posix' || value.hostOs === 'windows' ? value.hostOs : null
  const pids = Array.isArray(value.pids)
    ? value.pids.filter((pid): pid is number => Number.isSafeInteger(pid) && pid > 1)
    : null
  if (!hostOs || !pids) {
    return {}
  }
  return { oldRelays: { hostOs, pids: pids.slice(0, MAX_OLD_RELAY_PIDS) } }
}
