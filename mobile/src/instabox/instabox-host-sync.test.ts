import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstaboxApiError } from '../../../src/shared/instabox/instabox-api-client'
import type { HostProfile } from '../transport/types'

const mocks = vi.hoisted(() => ({
  session: { serverUrl: 'https://api.instabox.sh' } as { serverUrl: string } | null,
  hosts: [] as HostProfile[],
  machines: [] as { id: string; state: string; template: { id: string; version: string } }[],
  deleteMachine: vi.fn(async (_id: string) => ({})),
  removeHost: vi.fn(async (_id: string, _forget: unknown) => {}),
  enroll: vi.fn(async (_machine: unknown) => ({}))
}))

vi.mock('./instabox-mobile-session', () => ({
  loadInstaboxSession: async () => mocks.session,
  instaboxClient: () => ({
    deleteMachine: mocks.deleteMachine,
    listMachines: async () => mocks.machines,
    templates: async () => [
      {
        id: 'orca',
        version: '1',
        defaultSpec: { vcpus: 1, memMiB: 1024, persistentDiskGiB: 1 },
        capabilities: ['orca']
      }
    ]
  })
}))
vi.mock('../transport/host-removal-lifecycle', () => ({
  removeHostAndCloseClient: mocks.removeHost
}))
vi.mock('../transport/host-store', () => ({ loadHosts: async () => mocks.hosts }))
vi.mock('./instabox-host-enrollment', () => ({ addInstaboxMachineAsHost: mocks.enroll }))

// Loading host sync registers the machine deleter that host removal uses.
const { staleInstaboxHosts, syncInstaboxHosts } = await import('./instabox-host-sync')
const { removeHostEverywhere } = await import('./instabox-host-removal')
const { removeHostConfirmCopy } = await import('./instabox-host-identity')

function host(id: string, endpoint: string): HostProfile {
  return { id, name: id, endpoint, deviceToken: 't', publicKeyB64: 'k', lastConnected: 0 }
}

const machine = (id: string, state = 'running') => ({
  id,
  state,
  template: { id: 'orca', version: '1' }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = { serverUrl: 'https://api.instabox.sh' }
  mocks.hosts = []
  mocks.machines = []
})

describe('staleInstaboxHosts', () => {
  it('flags only this server’s Instabox hosts whose machine is gone', () => {
    const hosts = [
      host('instabox-kept', 'instabox://api.instabox.sh/kept'),
      host('instabox-gone', 'instabox://api.instabox.sh/gone'),
      // Saved before the domain move: still this server.
      host('instabox-old', 'instabox://api.box.instacloud.com/old'),
      host('instabox-elsewhere', 'instabox://instabox.example.com/elsewhere'),
      host('desktop', 'ws://192.168.1.2:6768')
    ]
    expect(
      staleInstaboxHosts(hosts, 'https://api.instabox.sh', new Set(['kept'])).map((h) => h.id)
    ).toEqual(['instabox-gone', 'instabox-old'])
  })
})

describe('removeHostEverywhere', () => {
  it('deletes the machine before removing its host', async () => {
    await removeHostEverywhere('instabox-m1', () => {})
    expect(mocks.deleteMachine).toHaveBeenCalledWith('m1')
    expect(mocks.removeHost).toHaveBeenCalledWith('instabox-m1', expect.any(Function))
  })

  it('treats an already deleted machine as deleted', async () => {
    mocks.deleteMachine.mockRejectedValueOnce(new InstaboxApiError(404, 'not_found', 'gone'))
    await removeHostEverywhere('instabox-m1', () => {})
    expect(mocks.removeHost).toHaveBeenCalled()
  })

  it('keeps the host when the server refuses or nobody is signed in', async () => {
    mocks.deleteMachine.mockRejectedValueOnce(new InstaboxApiError(500, 'internal', 'boom'))
    await expect(removeHostEverywhere('instabox-m1', () => {})).rejects.toThrow('boom')
    mocks.session = null
    await expect(removeHostEverywhere('instabox-m1', () => {})).rejects.toThrow('Sign in')
    expect(mocks.removeHost).not.toHaveBeenCalled()
  })

  it('only removes a paired desktop', async () => {
    await removeHostEverywhere('desktop', () => {})
    expect(mocks.deleteMachine).not.toHaveBeenCalled()
    expect(mocks.removeHost).toHaveBeenCalledWith('desktop', expect.any(Function))
  })
})

describe('syncInstaboxHosts', () => {
  it('drops hosts of deleted machines and adds running ones once per session', async () => {
    mocks.hosts = [
      host('instabox-gone', 'instabox://api.instabox.sh/gone'),
      host('instabox-kept', 'instabox://api.instabox.sh/kept')
    ]
    mocks.machines = [machine('kept'), machine('new'), machine('stopped', 'stopped')]
    await expect(syncInstaboxHosts(() => {})).resolves.toBe(true)
    expect(mocks.removeHost).toHaveBeenCalledExactlyOnceWith('instabox-gone', expect.any(Function))
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith(machine('new'))

    mocks.hosts = [host('instabox-kept', 'instabox://api.instabox.sh/kept')]
    await syncInstaboxHosts(() => {})
    expect(mocks.enroll).toHaveBeenCalledTimes(1)
  })

  it('does nothing while signed out', async () => {
    mocks.session = null
    await expect(syncInstaboxHosts(() => {})).resolves.toBe(false)
  })
})

describe('removeHostConfirmCopy', () => {
  it('says an Instabox host removal deletes the machine', () => {
    expect(removeHostConfirmCopy('instabox-m1', 'box').confirmLabel).toBe('Delete')
    expect(removeHostConfirmCopy('desktop', 'mac').title).toBe('Remove Host')
  })
})
