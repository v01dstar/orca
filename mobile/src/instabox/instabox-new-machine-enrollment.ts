// Fork: adds a just-created machine to Orca. It can report running before its Orca runtime
// listens, so wait for running and retry the enrollment until the runtime answers.
import type { InstaboxMachine } from '../../../src/shared/instabox/instabox-api-types'
import type { HostProfile } from '../transport/types'
import { addInstaboxMachineAsHost } from './instabox-host-enrollment'
import { instaboxClient } from './instabox-mobile-session'

const RUNNING_TIMEOUT_MS = 5 * 60_000
const RETRY_MS = 5_000
const ENROLL_ATTEMPTS = 12

export type NewMachineEnrollmentDeps = {
  getMachine: (id: string) => Promise<InstaboxMachine>
  enroll: (machine: InstaboxMachine) => Promise<HostProfile>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

const defaultDeps: NewMachineEnrollmentDeps = {
  getMachine: (id) => instaboxClient().getMachine(id),
  enroll: addInstaboxMachineAsHost,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now()
}

export async function addNewInstaboxMachineAsHost(
  machineId: string,
  deps: NewMachineEnrollmentDeps = defaultDeps
): Promise<HostProfile> {
  const deadline = deps.now() + RUNNING_TIMEOUT_MS
  let machine = await deps.getMachine(machineId)
  while (machine.state !== 'running') {
    if (machine.state === 'error') {
      throw new Error(machine.lastError?.message ?? 'the machine failed to start')
    }
    if (deps.now() >= deadline) {
      throw new Error(`the machine is still ${machine.state}`)
    }
    await deps.sleep(RETRY_MS)
    machine = await deps.getMachine(machineId)
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.enroll(machine)
    } catch (error) {
      if (attempt >= ENROLL_ATTEMPTS) {
        throw error
      }
      await deps.sleep(RETRY_MS)
    }
  }
}
