// Shapes the hangar IPC (main/ipc/hangar.ts) shares with preload and the renderer.
import type { HangarImage, HangarMachine, HangarTemplate } from './hangar-api-types'

export const HANGAR_STATE_CHANGED_CHANNEL = 'hangar:stateChanged'
export const HANGAR_ENVIRONMENTS_CHANGED_CHANNEL = 'hangar:environmentsChanged'

export type HangarSessionPersistence = 'encrypted' | 'memory-only'

export type HangarAccountState =
  | { signedIn: false; serverUrl: string | null }
  | { signedIn: true; serverUrl: string; login: string; persistence: HangarSessionPersistence }

export type HangarMachineEntry = {
  machine: HangarMachine
  // The machine's template has the `orca` capability (an Orca runtime runs in it).
  orcaCapable: boolean
  environmentId: string | null
}

export type HangarMachinesSnapshot = {
  machines: HangarMachineEntry[]
  templates: HangarTemplate[]
  // Images saved from an Orca-capable template version (new machines can be created from them).
  images: HangarImage[]
}
