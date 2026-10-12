/**
 * The command a user runs on an SSH host to stop the relay daemons an older Orca left running.
 * Scoped like the in-app action: only `<node> relay.js --detached` processes of this account whose
 * socket (POSIX) or credential file (Windows) lives under its Orca relay install directories.
 */
import type { SshOldRelayProcesses } from './ssh-types'

// Anchored at argv[0] so a shell whose script text mentions a relay launch never matches.
const POSIX_STOP_COMMAND =
  'pkill -u "$(id -u)" -f "^([^ ]*/)?node[^ /]* relay\\.js --detached .*--sock-path ($HOME/\\.orca-remote|/tmp/\\.orca-relay-$(id -u))/relay-"'

// Windows daemon argv, by position: `<node.exe> <relay.js> --detached ... --credential-file
// <%USERPROFILE%/.orca-remote/relay-...>`, each path quoted or not.
const WINDOWS_RELAY_ARGV_REGEX = String.raw`^(?:"(?:[^"]*\\)?node(?:\.exe)?"|(?:\S*\\)?node(?:\.exe)?)\s+(?:"(?:[^"]*\\)?relay\.js"|(?:\S*\\)?relay\.js)\s+--detached\s(?:.*\s)?--credential-file\s+"?`

// Owner-checked too: an elevated shell would otherwise reach other accounts' relays.
const WINDOWS_RELAY_DIR_REGEX = String.raw`\\\.orca-remote\\relay-`
const WINDOWS_STOP_COMMAND =
  `$h = [regex]::Escape($env:USERPROFILE); ` +
  `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ` +
  `Where-Object { $_.CommandLine -match ('${WINDOWS_RELAY_ARGV_REGEX}' + $h + '${WINDOWS_RELAY_DIR_REGEX}') -and ` +
  `($o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner).User -eq $env:USERNAME -and $o.Domain -eq $env:USERDOMAIN } | ` +
  `ForEach-Object { Stop-Process -Id $_.ProcessId }`

export function oldRelayStopCommand(hostOs: SshOldRelayProcesses['hostOs']): string {
  return hostOs === 'windows' ? WINDOWS_STOP_COMMAND : POSIX_STOP_COMMAND
}
