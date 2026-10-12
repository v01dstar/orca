/**
 * The relay daemons an older Orca left running on a POSIX SSH host, found and stopped by argv.
 *
 * A relay launches as `<node> relay.js --detached ... --sock-path <sock> ...` from its install
 * directory, binding `<sock>` under `~/.orca-remote/relay-<version>/` or, on long-`$HOME` hosts,
 * `/tmp/.orca-relay-<uid>/relay-<version>/`. Only a process of this account whose argv names
 * both is ever signalled, and the host re-checks that identity right before each signal, so a
 * recycled pid or any other process (orcad included) is left alone.
 */
import type { SshConnection } from './ssh-connection'
import { shellEscape } from './ssh-connection-utils'
import { RELAY_REMOTE_DIR } from './relay-protocol'
import { SHORT_RELAY_SOCKET_DIR_PREFIX } from './relay-socket-path-limit'
import { execCommand } from './ssh-relay-deploy-helpers'

// Same marker the runtime census lists daemons by (ssh-relay-endpoint-runtime.ts).
const RELAY_DAEMON_MARKER = ' relay.js --detached '
const MAX_OLD_RELAY_PIDS = 64
const TERM_GRACE_POLLS = 20
const KILL_CONFIRM_POLLS = 8
const POLL_SECONDS = '0.25'

/** Same listing as the runtime census, with each daemon's pid. */
export const OLD_RELAY_DAEMON_LIST_COMMAND =
  `{ ps -eww -o pid= -o args= 2>/dev/null || ps -o pid= -o args= 2>/dev/null; } | ` +
  `grep -F -- '${RELAY_DAEMON_MARKER.trim()}' || true`

function isRelayInstallSocket(sockPath: string, remoteHome: string): boolean {
  if (sockPath.split('/').includes('..')) {
    return false
  }
  return (
    sockPath.startsWith(`${remoteHome}/${RELAY_REMOTE_DIR}/relay-`) ||
    new RegExp(`^${SHORT_RELAY_SOCKET_DIR_PREFIX.replace(/\./g, '\\.')}\\d+/relay-`).test(sockPath)
  )
}

/**
 * The daemon's own argv, by position: `<node> relay.js --detached ... --sock-path <sock>`. A shell
 * whose command text merely mentions such a launch (`sh -c '...'`) has a different argv[1].
 */
function relayDaemonSocket(args: string[]): string | null {
  const [node, script, mode] = args
  if (
    !node?.split('/').pop()?.startsWith('node') ||
    script !== 'relay.js' ||
    mode !== '--detached'
  ) {
    return null
  }
  const index = args.indexOf('--sock-path', 3)
  return index > 0 ? (args[index + 1] ?? null) : null
}

/** Pids of relay daemons whose socket lives in this account's relay install directories. */
export function parseOldRelayDaemonPids(output: string, remoteHome: string): number[] {
  const pids: number[] = []
  for (const line of output.split('\n')) {
    const [rawPid, ...args] = line.trim().split(/\s+/)
    const pid = Number.parseInt(rawPid ?? '', 10)
    const sock = relayDaemonSocket(args)
    if (pid > 1 && sock && isRelayInstallSocket(sock, remoteHome) && !pids.includes(pid)) {
      pids.push(pid)
    }
  }
  return pids.slice(0, MAX_OLD_RELAY_PIDS)
}

/** Null when the host could not be listed: no pids is then unknown, not none. */
export async function listOldRelayDaemonPids(
  conn: SshConnection,
  remoteHome: string,
  signal?: AbortSignal
): Promise<number[] | null> {
  try {
    const output = await execCommand(conn, OLD_RELAY_DAEMON_LIST_COMMAND, {
      wrapCommand: true,
      signal
    })
    return parseOldRelayDaemonPids(output, remoteHome)
  } catch {
    return null
  }
}

/**
 * TERM each verified relay, give its shutdown (which ends its shells) a grace period, then KILL
 * the ones still there. Identity — owner uid, a `<node> relay.js --detached` argv, and a socket
 * under the install dirs — is re-read from the host before every signal. Prints `GONE`/`LIVE`/`SKIP <pid>`.
 */
export function endOldRelayDaemonsCommand(remoteHome: string, pids: readonly number[]): string {
  return [
    `base=${shellEscape(`${remoteHome}/${RELAY_REMOTE_DIR}`)}`,
    'uid=$(id -u 2>/dev/null)',
    '[ -n "$uid" ] || exit 0',
    `short_base="${SHORT_RELAY_SOCKET_DIR_PREFIX}$uid"`,
    "nl='",
    "'",
    // Why by argv position: a shell whose script text mentions a relay launch must never match.
    'is_old_relay() {',
    '  if [ -r "/proc/$1/cmdline" ]; then',
    `    args=$(tr '\\000' '\\n' < "/proc/$1/cmdline" 2>/dev/null)`,
    '    owner=$(stat -c %u "/proc/$1" 2>/dev/null)',
    '    split=$nl',
    '  else',
    '    args=$(ps -ww -o args= -p "$1" 2>/dev/null | tr "\\n" " ")',
    '    owner=$(ps -o uid= -p "$1" 2>/dev/null | tr -d " \\n")',
    "    split=' '",
    '  fi',
    '  [ -n "$uid" ] && [ "$owner" = "$uid" ] || return 1',
    '  old_ifs=$IFS; IFS=$split; set -f',
    '  set -- $args',
    '  set +f; IFS=$old_ifs',
    '  case "${1##*/}" in node*) ;; *) return 1 ;; esac',
    '  [ "$2" = relay.js ] && [ "$3" = --detached ] || return 1',
    '  shift 3',
    '  while [ $# -gt 1 ]; do',
    '    if [ "$1" = --sock-path ]; then',
    '      case "$2" in */../*) return 1 ;; "$base"/relay-*|"$short_base"/relay-*) return 0 ;; esac',
    '      return 1',
    '    fi',
    '    shift',
    '  done',
    '  return 1',
    '}',
    'owned=""',
    `for pid in ${pids.map((pid) => shellEscape(String(pid))).join(' ')}; do`,
    '  if is_old_relay "$pid"; then',
    '    kill -TERM "$pid" 2>/dev/null',
    '    owned="$owned $pid"',
    '  else',
    '    printf \'SKIP %s\\n\' "$pid"',
    '  fi',
    'done',
    'still_running() {',
    '  alive=""',
    '  for pid in $owned; do kill -0 "$pid" 2>/dev/null && alive="$alive $pid"; done',
    '}',
    'i=0',
    'still_running',
    `while [ -n "$alive" ] && [ $i -lt ${TERM_GRACE_POLLS} ]; do`,
    `  sleep ${POLL_SECONDS}`,
    '  i=$((i+1))',
    '  still_running',
    'done',
    'for pid in $alive; do',
    '  is_old_relay "$pid" && kill -KILL "$pid" 2>/dev/null',
    'done',
    'i=0',
    'still_running',
    `while [ -n "$alive" ] && [ $i -lt ${KILL_CONFIRM_POLLS} ]; do`,
    `  sleep ${POLL_SECONDS}`,
    '  i=$((i+1))',
    '  still_running',
    'done',
    'for pid in $owned; do',
    '  if kill -0 "$pid" 2>/dev/null; then printf \'LIVE %s\\n\' "$pid"; else printf \'GONE %s\\n\' "$pid"; fi',
    'done',
    "printf 'DONE\\n'"
  ].join('\n')
}

/** `stillRunning` includes every pid when the host never confirmed the run finished. */
export type OldRelayStopResult = { ended: number[]; stillRunning: number[]; skipped: number[] }

export function parseEndOldRelayDaemonsOutput(
  output: string,
  pids: readonly number[]
): OldRelayStopResult {
  const lines = output.split('\n').map((line) => line.trim())
  if (!lines.includes('DONE')) {
    return { ended: [], stillRunning: [...pids], skipped: [] }
  }
  const read = (state: string): number[] =>
    lines
      .filter((line) => line.startsWith(`${state} `))
      .map((line) => Number.parseInt(line.slice(state.length + 1), 10))
      .filter((pid) => pids.includes(pid))
  return { ended: read('GONE'), stillRunning: read('LIVE'), skipped: read('SKIP') }
}

export async function endOldRelayDaemons(
  conn: SshConnection,
  remoteHome: string,
  pids: readonly number[],
  signal?: AbortSignal
): Promise<OldRelayStopResult> {
  if (pids.length === 0) {
    return { ended: [], stillRunning: [], skipped: [] }
  }
  try {
    const output = await execCommand(conn, endOldRelayDaemonsCommand(remoteHome, pids), {
      wrapCommand: true,
      signal
    })
    return parseEndOldRelayDaemonsOutput(output, pids)
  } catch {
    // Loss of contact proves nothing ended; the reconnect's census decides.
    return { ended: [], stillRunning: [...pids], skipped: [] }
  }
}
