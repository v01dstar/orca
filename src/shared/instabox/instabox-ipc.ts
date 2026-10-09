// Shapes the instabox IPC (main/ipc/instabox.ts) shares with preload and the renderer.
import type { InstaboxSnapshot, InstaboxMachine, InstaboxTemplate } from './instabox-api-types'

export const INSTABOX_STATE_CHANGED_CHANNEL = 'instabox:stateChanged'
export const INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL = 'instabox:environmentsChanged'

export type InstaboxSessionPersistence = 'encrypted' | 'memory-only'

export type InstaboxAccountState =
  | { signedIn: false; serverUrl: string | null }
  | { signedIn: true; serverUrl: string; login: string; persistence: InstaboxSessionPersistence }

export type InstaboxMachineEntry = {
  machine: InstaboxMachine
  // The machine's template has the `orca` capability (an Orca runtime runs in it).
  orcaCapable: boolean
  environmentId: string | null
}

export type InstaboxMachinesListing = {
  machines: InstaboxMachineEntry[]
  templates: InstaboxTemplate[]
  // Snapshots saved from an Orca-capable template version (new machines can be created from them).
  snapshots: InstaboxSnapshot[]
}
