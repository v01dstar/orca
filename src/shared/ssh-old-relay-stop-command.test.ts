import { describe, expect, it } from 'vitest'
import { oldRelayStopCommand } from './ssh-old-relay-stop-command'

/** The PowerShell `-match` pattern for one profile dir, as `[regex]::Escape` would build it. */
function windowsSelector(home: string): RegExp {
  const match = /-match \('(.*?)' \+ \$h \+ '(.*?)'\)/.exec(oldRelayStopCommand('windows'))
  if (!match) {
    throw new Error('selector not found')
  }
  const escaped = home.replace(/[\\.^$|?*+()[\]{}#\s]/g, (char) => `\\${char}`)
  // PowerShell's -match is case-insensitive.
  return new RegExp(`${match[1]}${escaped}${match[2]}`, 'i')
}

describe('the Windows manual stop command', () => {
  const selector = windowsSelector('C:\\Users\\alice')

  it.each([
    '"C:\\Users\\alice\\.orca-remote\\node\\node.exe" "C:\\Users\\alice\\.orca-remote\\relay-1.4.224\\relay.js" --detached --grace-time 0 --sock-path "\\\\.\\pipe\\orca-relay-0123" --credential-file "C:\\Users\\alice\\.orca-remote\\relay-1.4.224\\a.credential"',
    'C:\\nodejs\\node.exe relay.js --detached --grace-time 0 --credential-file C:\\Users\\alice\\.orca-remote\\relay-1\\a.credential',
    '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\alice\\.orca-remote\\relay-1\\relay.js --detached --credential-file "C:\\Users\\alice\\.orca-remote\\relay-1\\a.credential"'
  ])('selects this account’s relay daemon: %s', (commandLine) => {
    expect(selector.test(commandLine)).toBe(true)
  })

  it.each([
    'node.exe -e "setInterval(()=>{},1000)" "relay.js --detached C:\\Users\\alice\\.orca-remote\\relay-demo"',
    'node.exe relay.js --connect --credential-file C:\\Users\\alice\\.orca-remote\\relay-1\\a.credential',
    'node.exe relay.js --detached --credential-file C:\\Users\\bob\\.orca-remote\\relay-1\\a.credential',
    'node.exe orcad.js --detached --credential-file C:\\Users\\alice\\.orca-remote\\relay-1\\a.credential',
    'C:\\a\\node.exe s.js C:\\b\\node relay.js --detached --credential-file C:\\Users\\alice\\.orca-remote\\relay-1\\a'
  ])('never selects anything else: %s', (commandLine) => {
    expect(selector.test(commandLine)).toBe(false)
  })

  it('also requires the process to belong to the current account', () => {
    expect(oldRelayStopCommand('windows')).toContain(
      '($o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner).User -eq $env:USERNAME -and $o.Domain -eq $env:USERDOMAIN'
    )
  })
})
