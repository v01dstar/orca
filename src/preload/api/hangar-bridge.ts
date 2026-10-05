import { ipcRenderer } from 'electron'
import {
  HANGAR_ENVIRONMENTS_CHANGED_CHANNEL,
  HANGAR_STATE_CHANGED_CHANNEL,
  type HangarAccountState
} from '../../shared/hangar/hangar-ipc'
import type { HangarApi } from './hangar-api'

export const hangarApi: HangarApi = {
  getState: () => ipcRenderer.invoke('hangar:getState'),
  signIn: (args) => ipcRenderer.invoke('hangar:signIn', args),
  signOut: () => ipcRenderer.invoke('hangar:signOut'),
  listMachines: () => ipcRenderer.invoke('hangar:listMachines'),
  createMachine: (args) => ipcRenderer.invoke('hangar:createMachine', args),
  machineAction: (args) => ipcRenderer.invoke('hangar:machineAction', args),
  deleteMachine: (args) => ipcRenderer.invoke('hangar:deleteMachine', args),
  connectMachine: (args) => ipcRenderer.invoke('hangar:connectMachine', args),
  onStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: HangarAccountState): void =>
      callback(state)
    ipcRenderer.on(HANGAR_STATE_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(HANGAR_STATE_CHANGED_CHANNEL, listener)
  },
  onEnvironmentsChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on(HANGAR_ENVIRONMENTS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(HANGAR_ENVIRONMENTS_CHANGED_CHANNEL, listener)
  }
}
