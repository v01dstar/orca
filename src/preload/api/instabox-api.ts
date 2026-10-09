import type {
  InstaboxCreateMachineRequest,
  InstaboxSnapshot,
  InstaboxMachine,
  InstaboxMachineAction
} from '../../shared/instabox/instabox-api-types'
import type {
  InstaboxAccountState,
  InstaboxMachinesListing
} from '../../shared/instabox/instabox-ipc'
import type { PublicKnownRuntimeEnvironment } from '../../shared/runtime-environments'

export type InstaboxApi = {
  getState: () => Promise<InstaboxAccountState>
  signIn: (args: { serverUrl: string }) => Promise<InstaboxAccountState>
  signOut: () => Promise<InstaboxAccountState>
  listMachines: () => Promise<InstaboxMachinesListing>
  createMachine: (args: InstaboxCreateMachineRequest) => Promise<InstaboxMachine>
  machineAction: (args: {
    machineId: string
    action: InstaboxMachineAction
  }) => Promise<InstaboxMachine>
  // The machine must be stopped; saves its root disk and /data (not RAM).
  saveSnapshot: (args: { machineId: string; name: string }) => Promise<InstaboxSnapshot>
  deleteMachine: (args: { machineId: string }) => Promise<void>
  connectMachine: (args: { machineId: string }) => Promise<PublicKnownRuntimeEnvironment>
  onStateChanged: (callback: (state: InstaboxAccountState) => void) => () => void
  onEnvironmentsChanged: (callback: () => void) => () => void
}
