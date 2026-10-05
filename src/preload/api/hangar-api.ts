import type {
  HangarCreateMachineRequest,
  HangarMachine,
  HangarMachineAction
} from '../../shared/hangar/hangar-api-types'
import type { HangarAccountState, HangarMachinesSnapshot } from '../../shared/hangar/hangar-ipc'
import type { PublicKnownRuntimeEnvironment } from '../../shared/runtime-environments'

export type HangarApi = {
  getState: () => Promise<HangarAccountState>
  signIn: (args: { serverUrl: string }) => Promise<HangarAccountState>
  signOut: () => Promise<HangarAccountState>
  listMachines: () => Promise<HangarMachinesSnapshot>
  createMachine: (args: HangarCreateMachineRequest) => Promise<HangarMachine>
  machineAction: (args: {
    machineId: string
    action: HangarMachineAction
  }) => Promise<HangarMachine>
  deleteMachine: (args: { machineId: string }) => Promise<void>
  connectMachine: (args: { machineId: string }) => Promise<PublicKnownRuntimeEnvironment>
  onStateChanged: (callback: (state: HangarAccountState) => void) => () => void
  onEnvironmentsChanged: (callback: () => void) => () => void
}
