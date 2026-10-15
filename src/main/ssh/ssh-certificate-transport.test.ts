import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SshTarget } from '../../shared/ssh-types'
import { parseSshGOutput } from './ssh-config-parser'
import { requiresSystemSshForCertificate } from './ssh-transport-selection'

const { findSystemSshMock } = vi.hoisted(() => ({ findSystemSshMock: vi.fn() }))

vi.mock('./system-ssh-binary', () => ({ findSystemSsh: findSystemSshMock }))

let directory = ''

function target(overrides: Partial<SshTarget> = {}): SshTarget {
  return { id: 't', label: 'box', host: 'example.com', port: 22, username: 'u', ...overrides }
}

beforeEach(async () => {
  findSystemSshMock.mockReturnValue('/usr/bin/ssh')
  directory = await mkdtemp(join(tmpdir(), 'orca-ssh-cert-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('requiresSystemSshForCertificate', () => {
  it('routes a configured CertificateFile through OpenSSH', async () => {
    const cert = join(directory, 'box-cert.pub')
    await writeFile(cert, 'ssh-ed25519-cert-v01@openssh.com AAAA')
    const resolved = { identityFile: [], certificateFile: [cert] }

    await expect(requiresSystemSshForCertificate(target(), resolved)).resolves.toBe(true)
    findSystemSshMock.mockReturnValue(null)
    await expect(requiresSystemSshForCertificate(target(), resolved)).resolves.toBe(false)
  })

  it('finds the certificate OpenSSH loads beside an identity', async () => {
    const key = join(directory, 'id_ed25519')
    await writeFile(`${key}-cert.pub`, 'ssh-ed25519-cert-v01@openssh.com AAAA')

    await expect(
      requiresSystemSshForCertificate(target({ identityFile: key }), null)
    ).resolves.toBe(true)
  })

  it('leaves targets without an existing certificate on ssh2', async () => {
    const resolved = {
      identityFile: [join(directory, 'id_ed25519')],
      certificateFile: [join(directory, 'missing-cert.pub')]
    }
    await expect(requiresSystemSshForCertificate(target(), resolved)).resolves.toBe(false)
  })
})

describe('parseSshGOutput certificatefile', () => {
  it('collects every CertificateFile line', () => {
    const resolved = parseSshGOutput(
      'hostname box\ncertificatefile /a-cert.pub\ncertificatefile /b-cert.pub\n'
    )
    expect(resolved.certificateFile).toEqual(['/a-cert.pub', '/b-cert.pub'])
  })
})
