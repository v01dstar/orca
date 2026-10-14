import { describe, expect, it, vi } from 'vitest'
import type { InstaboxMachine } from '../../../src/shared/instabox/instabox-api-types'
import type { HostProfile } from '../transport/types'
import {
  addNewInstaboxMachineAsHost,
  type NewMachineEnrollmentDeps
} from './instabox-new-machine-enrollment'

vi.mock('./instabox-host-enrollment', () => ({ addInstaboxMachineAsHost: vi.fn() }))
vi.mock('./instabox-mobile-session', () => ({ instaboxClient: vi.fn() }))

function machine(state: string, lastError: InstaboxMachine['lastError'] = null): InstaboxMachine {
  return {
    id: 'm_1',
    name: 'box',
    desiredState: 'running',
    state,
    revision: 1,
    template: { id: 'orca', version: '1' },
    spec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    runtime: { ready: state === 'running' },
    lastError,
    createdAt: '',
    updatedAt: ''
  }
}

const host: HostProfile = {
  id: 'instabox-m_1',
  name: 'box',
  endpoint: 'instabox://api/m_1',
  deviceToken: 'token',
  publicKeyB64: 'key',
  lastConnected: 0
}

function deps(states: InstaboxMachine[], enroll: NewMachineEnrollmentDeps['enroll']) {
  let clock = 0
  const getMachine = vi.fn(async () => states.shift() ?? machine('running'))
  return {
    getMachine,
    enroll: vi.fn(enroll),
    sleep: vi.fn(async (ms: number) => void (clock += ms)),
    now: () => clock
  }
}

describe('addNewInstaboxMachineAsHost', () => {
  it('waits for the machine to run, then retries until the runtime accepts', async () => {
    let calls = 0
    const d = deps([machine('creating'), machine('starting'), machine('running')], async () => {
      calls += 1
      if (calls < 3) {
        throw new Error('Instabox tunnel closed (1006)')
      }
      return host
    })
    await expect(addNewInstaboxMachineAsHost('m_1', d)).resolves.toBe(host)
    expect(d.getMachine).toHaveBeenCalledTimes(3)
    expect(d.enroll).toHaveBeenCalledTimes(3)
  })

  it('stops when the machine fails to start', async () => {
    const d = deps(
      [machine('error', { code: 'boot_failed', message: 'boot failed' })],
      async () => host
    )
    await expect(addNewInstaboxMachineAsHost('m_1', d)).rejects.toThrow('boot failed')
    expect(d.enroll).not.toHaveBeenCalled()
  })

  it('gives up on a machine that never runs', async () => {
    const d = deps([], async () => host)
    d.getMachine.mockImplementation(async () => machine('creating'))
    await expect(addNewInstaboxMachineAsHost('m_1', d)).rejects.toThrow('still creating')
  })

  it('surfaces the last enrollment error after the final attempt', async () => {
    const d = deps([], async () => {
      throw new Error('the runtime refused the Instabox sign-in')
    })
    await expect(addNewInstaboxMachineAsHost('m_1', d)).rejects.toThrow('refused')
    expect(d.enroll).toHaveBeenCalledTimes(12)
  })
})
