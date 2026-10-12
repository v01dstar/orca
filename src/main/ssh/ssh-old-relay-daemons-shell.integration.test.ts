/**
 * The old-relay stop runs on someone else's machine and decides which pids are signalled, so the
 * listing and the stop script run here through /bin/sh against real processes laid out the way
 * an older Orca installed its relay.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  endOldRelayDaemonsCommand,
  OLD_RELAY_DAEMON_LIST_COMMAND,
  parseEndOldRelayDaemonsOutput,
  parseOldRelayDaemonPids
} from './ssh-old-relay-daemons'
import { oldRelayStopCommand } from '../../shared/ssh-old-relay-stop-command'

const posixOnly = process.platform === 'win32' ? describe.skip : describe

const IDLE_SOURCE = `
if (process.argv.includes('--ignore-term')) process.on('SIGTERM', () => {})
setInterval(() => {}, 1000)
setTimeout(() => process.exit(0), 60000)
process.stdout.write('READY\\n')
`

function sh(script: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/bin/sh', ['-c', script], { timeout: 30_000, env }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

let workDir: string
let home: string
const running: ChildProcess[] = []

function startProcess(cwd: string, script: string, args: string[]): Promise<ChildProcess> {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  running.push(child)
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.stdout?.once('data', () => resolve(child))
  })
}

function isAlive(child: ChildProcess): boolean {
  try {
    process.kill(child.pid!, 0)
    return true
  } catch {
    return false
  }
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  await new Promise((resolve) => child.once('exit', resolve))
}

/** An install dir laid out like an older Orca's, with the daemon started from inside it. */
function installRelay(version: string, file = 'relay.js'): string {
  const dir = join(home, '.orca-remote', `relay-${version}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), IDLE_SOURCE)
  return dir
}

function startRelay(dir: string, sockPath: string, extra: string[] = []): Promise<ChildProcess> {
  return startProcess(dir, 'relay.js', [
    '--detached',
    '--grace-time',
    '0',
    '--sock-path',
    sockPath,
    ...extra
  ])
}

posixOnly('old relay daemons on a POSIX host', () => {
  beforeAll(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-old-relay-')))
    home = join(workDir, 'home')
  })

  afterEach(() => {
    for (const child of running.splice(0)) {
      child.kill('SIGKILL')
    }
  })

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('lists and ends only relay daemons under the install dir, escalating to KILL', async () => {
    const dir = installRelay('1.4.224')
    const relay = await startRelay(dir, join(dir, 'relay-a.sock'))
    const stubborn = await startRelay(dir, join(dir, 'relay-b.sock'), ['--ignore-term'])
    // Decoys: a relay.js outside the install dir, a managed server under it, a bridge client.
    const outsideDir = join(workDir, 'elsewhere')
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(outsideDir, 'relay.js'), IDLE_SOURCE)
    const outside = await startRelay(outsideDir, join(outsideDir, 'relay-c.sock'))
    const orcadDir = installRelay('orcad', 'orcad.js')
    const orcad = await startProcess(orcadDir, 'orcad.js', [
      '--sock-path',
      join(dir, 'relay-a.sock')
    ])
    const bridge = await startProcess(dir, 'relay.js', [
      '--connect',
      '--sock-path',
      join(dir, 'relay-a.sock')
    ])

    // A same-account shell whose script text mentions a relay launch, running unrelated work.
    const shellDecoy = spawn(
      '/bin/sh',
      [
        '-c',
        `echo READY; : node relay.js --detached --sock-path ${join(dir, 'relay-a.sock')}; sleep 60; true`
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    running.push(shellDecoy)
    await new Promise((resolve) => shellDecoy.stdout?.once('data', resolve))

    const listing = await sh(OLD_RELAY_DAEMON_LIST_COMMAND)
    // The decoy is in the raw listing; only argv position keeps it out.
    expect(listing).toMatch(new RegExp(`^\\s*${shellDecoy.pid}\\s`, 'm'))
    const pids = parseOldRelayDaemonPids(listing, home)
    expect(pids.sort()).toEqual([relay.pid, stubborn.pid].sort())
    // The manual command the error text names matches the same processes (pgrep: list only).
    const manual = oldRelayStopCommand('posix').replace(/^pkill /, 'pgrep ')
    const manualPids = (await sh(`${manual} || true`, { ...process.env, HOME: home }))
      .split('\n')
      .filter(Boolean)
      .map(Number)
    expect(manualPids.sort()).toEqual([relay.pid, stubborn.pid].sort())

    const result = parseEndOldRelayDaemonsOutput(
      await sh(endOldRelayDaemonsCommand(home, pids)),
      pids
    )
    expect(result.ended.sort()).toEqual([relay.pid, stubborn.pid].sort())
    expect(result.stillRunning).toEqual([])
    await waitForExit(relay)
    await waitForExit(stubborn)
    expect(isAlive(outside)).toBe(true)
    expect(isAlive(orcad)).toBe(true)
    expect(isAlive(bridge)).toBe(true)
    expect(isAlive(shellDecoy)).toBe(true)
  }, 30_000)

  it('skips a shell whose script text names a relay launch, even when handed its pid', async () => {
    const dir = installRelay('1.4.224')
    const decoy = spawn(
      '/bin/sh',
      [
        '-c',
        `echo READY; : node relay.js --detached --sock-path ${join(dir, 'relay-z.sock')}; sleep 60; true`
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    running.push(decoy)
    await new Promise((resolve) => decoy.stdout?.once('data', resolve))

    const result = parseEndOldRelayDaemonsOutput(
      await sh(endOldRelayDaemonsCommand(home, [decoy.pid!])),
      [decoy.pid!]
    )
    expect(result).toEqual({ ended: [], stillRunning: [], skipped: [decoy.pid] })
    expect(isAlive(decoy)).toBe(true)
  })

  it('skips a pid that no longer runs an old relay instead of signalling it', async () => {
    const decoyDir = join(workDir, 'decoy')
    mkdirSync(decoyDir, { recursive: true })
    writeFileSync(join(decoyDir, 'relay.js'), IDLE_SOURCE)
    // Same argv shape, but its socket is not under this account's relay install dirs.
    const decoy = await startRelay(decoyDir, join(decoyDir, 'relay-a.sock'))

    const result = parseEndOldRelayDaemonsOutput(
      await sh(endOldRelayDaemonsCommand(home, [decoy.pid!])),
      [decoy.pid!]
    )
    expect(result).toEqual({ ended: [], stillRunning: [], skipped: [decoy.pid] })
    expect(isAlive(decoy)).toBe(true)
  })
})
