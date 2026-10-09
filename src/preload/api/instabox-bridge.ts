import { ipcRenderer } from 'electron'
import {
  INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL,
  INSTABOX_STATE_CHANGED_CHANNEL,
  type InstaboxAccountState
} from '../../shared/instabox/instabox-ipc'
import type { InstaboxApi } from './instabox-api'

export const instaboxApi: InstaboxApi = {
  getState: () => ipcRenderer.invoke('instabox:getState'),
  signIn: (args) => ipcRenderer.invoke('instabox:signIn', args),
  signOut: () => ipcRenderer.invoke('instabox:signOut'),
  listMachines: () => ipcRenderer.invoke('instabox:listMachines'),
  createMachine: (args) => ipcRenderer.invoke('instabox:createMachine', args),
  machineAction: (args) => ipcRenderer.invoke('instabox:machineAction', args),
  saveSnapshot: (args) => ipcRenderer.invoke('instabox:saveSnapshot', args),
  deleteMachine: (args) => ipcRenderer.invoke('instabox:deleteMachine', args),
  connectMachine: (args) => ipcRenderer.invoke('instabox:connectMachine', args),
  onStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: InstaboxAccountState): void =>
      callback(state)
    ipcRenderer.on(INSTABOX_STATE_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(INSTABOX_STATE_CHANGED_CHANNEL, listener)
  },
  onEnvironmentsChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on(INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL, listener)
  }
}
