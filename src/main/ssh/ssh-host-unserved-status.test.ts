import { describe, expect, it } from 'vitest'
import { unservedHostServerMessage, unservedServerStatus } from './ssh-host-unserved-status'

describe('an unserved host’s untranslated message', () => {
  it('names the scoped stop command and the census pids for old relay terminals', () => {
    const decision = {
      route: 'relay' as const,
      reason: 'relay_terminals_live' as const,
      terminals: 2,
      oldRelays: { hostOs: 'posix' as const, pids: [4101, 4102] }
    }
    const message = unservedHostServerMessage(decision)
    expect(message).toContain('(process IDs 4101, 4102)')
    expect(message).toContain(
      'pkill -u "$(id -u)" -f "^([^ ]*/)?node[^ /]* relay\\.js --detached .*--sock-path'
    )
    expect(message).not.toContain('pkill -f relay.js')
    expect(unservedServerStatus(decision).oldRelays).toEqual(decision.oldRelays)
  })

  it('still names the command when the census could not prove them', () => {
    const message = unservedHostServerMessage({
      route: 'relay',
      reason: 'relay_terminals_unverifiable',
      oldRelays: { hostOs: 'windows', pids: [] }
    })
    expect(message).toContain('Get-CimInstance Win32_Process')
    expect(message).not.toContain('process IDs')
  })
})
