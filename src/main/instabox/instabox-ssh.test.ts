import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstaboxSshConnection } from '../../shared/instabox/instabox-api-types'
import { prepareInstaboxSsh } from './instabox-ssh'

let root = ''

const grant = (overrides: Partial<InstaboxSshConnection> = {}): InstaboxSshConnection => ({
  host: 'ssh.instabox.sh',
  port: 2222,
  username: 'm1',
  certificate: 'ssh-ed25519-cert-v01@openssh.com AAAACERT',
  expiresAt: '2026-10-15T00:00:00Z',
  hostTrust: { publicKey: 'ssh-ed25519 AAAACA comment' },
  ...overrides
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca instabox-ssh-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('prepareInstaboxSsh', () => {
  it('mints a certificate for one reused key and returns a quoted ssh command', async () => {
    const dir = join(root, 'ssh')
    const mint = vi.fn(async (_publicKey: string) => grant())

    const command = await prepareInstaboxSsh(dir, 'm1', mint)
    await prepareInstaboxSsh(dir, 'm1', mint)

    const [firstKey, secondKey] = mint.mock.calls.map(([key]) => key)
    expect(firstKey).toMatch(/^ssh-ed25519 \S+$/)
    expect(secondKey).toBe(firstKey)
    expect((await stat(join(dir, 'id_ed25519'))).mode & 0o777).toBe(0o600)
    expect(await readFile(join(dir, 'm1-cert.pub'), 'utf8')).toBe(`${grant().certificate}\n`)
    // The temp dir has a space, so paths arrive single-quoted.
    expect(command).toContain(`'CertificateFile=${join(dir, 'm1-cert.pub')}'`)
    expect(command).toMatch(/^ssh -p 2222 -i '.+id_ed25519' -o IdentitiesOnly=yes /)
    expect(command.endsWith(' m1@ssh.instabox.sh')).toBe(true)
  })

  it('keeps one CA line per gateway in known_hosts', async () => {
    const dir = join(root, 'ssh')
    await prepareInstaboxSsh(dir, 'm1', async () => grant())
    await prepareInstaboxSsh(dir, 'm2', async () =>
      grant({ hostTrust: { publicKey: 'ssh-ed25519 AAAANEWCA' } })
    )
    await prepareInstaboxSsh(dir, 'm3', async () => grant({ host: 'other.example', port: 22 }))

    expect(await readFile(join(dir, 'known_hosts'), 'utf8')).toBe(
      '@cert-authority [ssh.instabox.sh]:2222 ssh-ed25519 AAAANEWCA\n' +
        '@cert-authority other.example ssh-ed25519 AAAACA\n'
    )
  })
})
