import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstaboxApiError } from '../../shared/instabox/instabox-api-client'
import { encodePairingOffer } from '../../shared/pairing'
import { writeSecureJsonFile } from '../../shared/secure-file'
import {
  addEnvironmentFromPairingCode,
  listEnvironments
} from '../../shared/runtime-environment-store'
import type { InstaboxAccount } from './instabox-account'
import { InstaboxEnvironments } from './instabox-environments'
import type { InstaboxTunnelProxy } from './instabox-tunnel-proxy'

const API = 'https://api.instabox.sh'

let userDataPath: string
beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'instabox-environments-'))
})
afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

function seed(links: { machineId: string; serverUrl: string }[]): string[] {
  const environmentIds = links.map(
    ({ machineId }) =>
      addEnvironmentFromPairingCode(userDataPath, {
        name: machineId,
        pairingCode: encodePairingOffer({
          v: 2,
          endpoint: `ws://127.0.0.1:1/${machineId}`,
          deviceToken: 'device-token',
          publicKeyB64: Buffer.from(new Uint8Array(32).fill(1)).toString('base64'),
          scope: 'runtime'
        }),
        source: 'instabox'
      }).id
  )
  writeSecureJsonFile(join(userDataPath, 'instabox-environments.json'), {
    version: 1,
    links: links.map((link, i) => ({ ...link, environmentId: environmentIds[i] }))
  })
  return environmentIds
}

function environments(createOrcaConnection = vi.fn()) {
  const onChanged = vi.fn()
  const onRemoved = vi.fn()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only client().createOrcaConnection is used.
  const account = { client: () => ({ createOrcaConnection }) } as unknown as InstaboxAccount
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these tests never dial the proxy.
  const proxy = {} as InstaboxTunnelProxy
  return {
    envs: new InstaboxEnvironments(userDataPath, account, proxy, onChanged, onRemoved),
    onChanged,
    onRemoved
  }
}

describe('InstaboxEnvironments', () => {
  it('forgets machines the server no longer lists, on that server only', () => {
    const [, goneId] = seed([
      { machineId: 'kept', serverUrl: API },
      { machineId: 'gone', serverUrl: 'https://api.box.instacloud.com' },
      { machineId: 'other-server', serverUrl: 'https://instabox.example.com' }
    ])
    const { envs, onChanged, onRemoved } = environments()

    envs.forgetMissing(API, new Set(['kept']))

    expect(envs.links().map((link) => link.machineId)).toEqual(['kept', 'other-server'])
    expect(listEnvironments(userDataPath).map((env) => env.name)).toEqual(['kept', 'other-server'])
    expect(onRemoved).toHaveBeenCalledExactlyOnceWith(goneId)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('does nothing when every linked machine still exists', () => {
    seed([{ machineId: 'kept', serverUrl: API }])
    const { envs, onChanged } = environments()
    envs.forgetMissing(API, new Set(['kept']))
    expect(envs.links()).toHaveLength(1)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('forgets a machine when instabox says it no longer exists', async () => {
    seed([{ machineId: 'gone', serverUrl: API }])
    const { envs } = environments(
      vi.fn(async () => {
        throw new InstaboxApiError(404, 'not_found', 'machine not found')
      })
    )
    await expect(envs.resolveTunnel('gone')).rejects.toThrow('machine not found')
    expect(envs.links()).toEqual([])
    expect(listEnvironments(userDataPath)).toEqual([])
  })

  it('keeps the machine on a 404 that did not come from the instabox API', async () => {
    seed([{ machineId: 'kept', serverUrl: API }])
    const { envs } = environments(
      vi.fn(async () => {
        throw new InstaboxApiError(404, 'http_error', 'Instabox returned 404')
      })
    )
    await expect(envs.resolveTunnel('kept')).rejects.toThrow()
    expect(envs.links()).toHaveLength(1)
  })
})
