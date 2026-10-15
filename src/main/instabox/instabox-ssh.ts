// Fork: SSH into an instabox machine from a local terminal. The gateway accepts only short-lived
// user certificates, so each session mints one for a key Orca keeps in its own directory.
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { utils } from 'ssh2'
import type { InstaboxSshConnection } from '../../shared/instabox/instabox-api-types'

export type InstaboxSshPaths = {
  key: string
  knownHosts: string
  cert: (machineId: string) => string
}

export function instaboxSshPaths(dir: string): InstaboxSshPaths {
  return {
    key: join(dir, 'id_ed25519'),
    knownHosts: join(dir, 'known_hosts'),
    cert: (machineId) => join(dir, `${machineId}-cert.pub`)
  }
}

/** `type base64`, without the comment: the form instabox signs and known_hosts lines use. */
function keyBody(authorizedKey: string): string {
  return authorizedKey.trim().split(/\s+/).slice(0, 2).join(' ')
}

/** The public key of Orca's instabox SSH key, generating the pair on first use. */
export async function ensureInstaboxSshKey(paths: InstaboxSshPaths): Promise<string> {
  try {
    return keyBody(await readFile(`${paths.key}.pub`, 'utf8'))
  } catch {
    // First use (or a half-written pair): generate below.
  }
  const pair = utils.generateKeyPairSync('ed25519', { comment: 'orca-instabox' })
  await writeFile(paths.key, pair.private, { mode: 0o600 })
  // Why: ssh refuses a private key other users can read, and writeFile keeps an old file's mode.
  await chmod(paths.key, 0o600)
  await writeFile(`${paths.key}.pub`, `${pair.public}\n`, { mode: 0o644 })
  return keyBody(pair.public)
}

function knownHostsPattern(host: string, port: number): string {
  return port === 0 || port === 22 ? host : `[${host}]:${port}`
}

/** Trusts the gateway's host CA for host:port, replacing an earlier line for the same host. */
async function trustGateway(paths: InstaboxSshPaths, grant: InstaboxSshConnection): Promise<void> {
  const pattern = knownHostsPattern(grant.host, grant.port)
  const existing = await readFile(paths.knownHosts, 'utf8').catch(() => '')
  const kept = existing.split('\n').filter((line) => {
    const fields = line.trim().split(/\s+/)
    return line.trim() !== '' && !(fields[0] === '@cert-authority' && fields[1] === pattern)
  })
  kept.push(`@cert-authority ${pattern} ${keyBody(grant.hostTrust.publicKey)}`)
  await writeFile(paths.knownHosts, `${kept.join('\n')}\n`, { mode: 0o600 })
}

// Why single quotes: literal in POSIX shells, fish and PowerShell alike.
function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

export function instaboxSshArgs(
  paths: InstaboxSshPaths,
  machineId: string,
  grant: InstaboxSshConnection
): string[] {
  return [
    'ssh',
    '-p',
    String(grant.port || 22),
    '-i',
    paths.key,
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    `CertificateFile=${paths.cert(machineId)}`,
    '-o',
    `UserKnownHostsFile=${paths.knownHosts}`,
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'UpdateHostKeys=no',
    `${grant.username || machineId}@${grant.host}`
  ]
}

/**
 * Mints a certificate for machineId and returns the ssh command line that uses it. The
 * certificate is short-lived; each call mints a fresh one.
 */
export async function prepareInstaboxSsh(
  dir: string,
  machineId: string,
  mint: (publicKey: string) => Promise<InstaboxSshConnection>
): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const paths = instaboxSshPaths(dir)
  const grant = await mint(await ensureInstaboxSshKey(paths))
  await writeFile(paths.cert(machineId), `${grant.certificate.trim()}\n`, { mode: 0o600 })
  await trustGateway(paths, grant)
  return instaboxSshArgs(paths, machineId, grant).map(shellQuote).join(' ')
}
