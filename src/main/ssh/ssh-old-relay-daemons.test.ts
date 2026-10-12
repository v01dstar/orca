import { describe, expect, it } from 'vitest'
import {
  endOldRelayDaemonsCommand,
  parseEndOldRelayDaemonsOutput,
  parseOldRelayDaemonPids
} from './ssh-old-relay-daemons'

const home = '/home/me'

describe('old relay daemon pids', () => {
  it('keeps only detached relays whose socket is under this account’s relay install dirs', () => {
    const listing = [
      ' 4101 /usr/bin/node relay.js --detached --grace-time 0 --sock-path /home/me/.orca-remote/relay-1.4.224/relay-ab.sock --credential-file x',
      ' 4102 /home/me/.orca-remote/node/bin/node relay.js --detached --grace-time 0 --sock-path /tmp/.orca-relay-1000/relay-9f/relay-ab.sock',
      // Another user's install, a relay outside the dirs, a bridge client, orcad, a traversal.
      ' 4103 node relay.js --detached --sock-path /home/other/.orca-remote/relay-1/relay.sock',
      ' 4104 node relay.js --detached --sock-path /srv/relay-1/relay.sock',
      ' 4105 node relay.js --connect --sock-path /home/me/.orca-remote/relay-1/relay.sock',
      ' 4106 node orcad.js --detached --sock-path /home/me/.orca-remote/relay-1/relay.sock',
      ' 4107 node relay.js --detached --sock-path /home/me/.orca-remote/relay-1/../../x.sock',
      ' 4108 grep -F -- relay.js --detached',
      // A shell whose script text mentions a relay launch is not the daemon.
      ' 4109 sh -c node relay.js --detached --sock-path /home/me/.orca-remote/relay-1/relay.sock & backup; wait',
      ' 4110 /usr/bin/python3 relay.js --detached --sock-path /home/me/.orca-remote/relay-1/relay.sock',
      ' 1 node relay.js --detached --sock-path /home/me/.orca-remote/relay-1/relay.sock'
    ].join('\n')
    expect(parseOldRelayDaemonPids(listing, home)).toEqual([4101, 4102])
  })

  it('re-verifies owner and argv before each signal and escalates TERM to KILL', () => {
    const command = endOldRelayDaemonsCommand(home, [4101])
    expect(command).toContain(`base='/home/me/.orca-remote'`)
    expect(command).toContain('[ -n "$uid" ] && [ "$owner" = "$uid" ] || return 1')
    expect(command).toContain('[ "$2" = relay.js ] && [ "$3" = --detached ] || return 1')
    expect(command).toContain('kill -TERM "$pid"')
    expect(command).toContain('is_old_relay "$pid" && kill -KILL "$pid"')
    expect(command).not.toMatch(/pkill|killall|kill -9 -1/)
  })

  it('claims an end only for pids the host reported gone', () => {
    expect(
      parseEndOldRelayDaemonsOutput(
        'GONE 4101\nLIVE 4102\nSKIP 4103\nGONE 999\nDONE\n',
        [4101, 4102, 4103]
      )
    ).toEqual({ ended: [4101], stillRunning: [4102], skipped: [4103] })
    expect(parseEndOldRelayDaemonsOutput('GONE 4101\n', [4101])).toEqual({
      ended: [],
      stillRunning: [4101],
      skipped: []
    })
  })
})
