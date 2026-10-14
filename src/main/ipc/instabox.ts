// IPC for instabox (fork): account, machines, and their Orca environments.
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  instaboxOrcaMachines,
  instaboxRunsOrca,
  instaboxOrcaSnapshots,
  type InstaboxCreateMachineRequest,
  type InstaboxSnapshot,
  type InstaboxMachine,
  type InstaboxMachineAction,
  type InstaboxTemplate
} from '../../shared/instabox/instabox-api-types'
import {
  INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL,
  INSTABOX_STATE_CHANGED_CHANNEL,
  type InstaboxMachinesListing
} from '../../shared/instabox/instabox-ipc'
import { redactRuntimeEnvironment } from '../../shared/runtime-environments'
import { InstaboxAccount } from '../instabox/instabox-account'
import { InstaboxEnvironments } from '../instabox/instabox-environments'
import { InstaboxTunnelProxy } from '../instabox/instabox-tunnel-proxy'
import type { Store } from '../persistence'
import { retireRemovedRuntimeEnvironment } from './runtime-environment-removal-cleanup'
import { invalidateRuntimeEnvironmentTransport } from './runtime-environments'

function broadcast(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      try {
        window.webContents.send(channel, payload)
      } catch {
        // A renderer can disappear between isDestroyed() and send().
      }
    }
  }
}

export async function registerInstaboxHandlers(store: Store): Promise<void> {
  const userDataPath = app.getPath('userData')
  const account = new InstaboxAccount(userDataPath)
  let environments: InstaboxEnvironments | null = null
  const proxy = new InstaboxTunnelProxy((machineId) => {
    if (!environments) {
      return Promise.reject(new Error('Instabox is starting'))
    }
    return environments.resolveTunnel(machineId)
  })
  await proxy.start()
  environments = new InstaboxEnvironments(
    userDataPath,
    account,
    proxy,
    () => broadcast(INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL),
    (environmentId) =>
      void retireRemovedRuntimeEnvironment(
        environmentId,
        invalidateRuntimeEnvironmentTransport,
        store
      ).catch((error: unknown) =>
        console.warn('[instabox] Retiring a deleted machine environment failed:', error)
      )
  )
  const envs = environments
  envs.refreshEndpoints()
  account.onChange((state) => broadcast(INSTABOX_STATE_CHANGED_CHANNEL, state))
  app.once('will-quit', () => proxy.stop())

  // Why: an Orca environment needs a running machine with an orca-capable template.
  async function ensureEnvironment(machine: InstaboxMachine, templates: InstaboxTemplate[]) {
    const linked = envs.links().some((link) => link.machineId === machine.id)
    if (!linked && machine.state === 'running' && instaboxRunsOrca(machine.template, templates)) {
      await envs.connect(machine)
    }
  }

  // Why: machines are also created and deleted from the phone, CLI and dashboard; mirror the
  // server so a deleted machine's entry goes and a new running one gets an entry.
  function syncEnvironments(machines: InstaboxMachine[], templates: InstaboxTemplate[]): void {
    envs.forgetMissing(account.client().baseUrl, new Set(machines.map((machine) => machine.id)))
    for (const machine of instaboxOrcaMachines(machines, templates)) {
      void ensureEnvironment(machine, templates).catch((error: unknown) =>
        console.warn(`[instabox] Adding machine ${machine.id} to Orca failed:`, error)
      )
    }
  }

  async function syncFromServer(): Promise<void> {
    if (!account.state().signedIn) {
      return
    }
    const client = account.client()
    const [machines, templates] = await Promise.all([client.listMachines(), client.templates()])
    syncEnvironments(machines, templates)
  }
  void syncFromServer().catch((error: unknown) =>
    console.warn('[instabox] Syncing machines at startup failed:', error)
  )

  ipcMain.removeHandler('instabox:getState')
  ipcMain.handle('instabox:getState', () => account.state())

  ipcMain.removeHandler('instabox:signIn')
  ipcMain.handle('instabox:signIn', (_event, args: { serverUrl: string }) =>
    account.signIn(args.serverUrl)
  )

  ipcMain.removeHandler('instabox:signOut')
  ipcMain.handle('instabox:signOut', () => account.signOut())

  ipcMain.removeHandler('instabox:listMachines')
  ipcMain.handle('instabox:listMachines', async (): Promise<InstaboxMachinesListing> => {
    const client = account.client()
    const [machines, templates, snapshots] = await Promise.all([
      client.listMachines(),
      client.templates(),
      client.listSnapshots()
    ])
    syncEnvironments(machines, templates)
    const links = envs.links()
    return {
      machines: instaboxOrcaMachines(machines, templates).map((machine) => ({
        machine,
        environmentId: links.find((link) => link.machineId === machine.id)?.environmentId ?? null
      })),
      templates,
      snapshots: instaboxOrcaSnapshots(snapshots, templates)
    }
  })

  ipcMain.removeHandler('instabox:createMachine')
  ipcMain.handle('instabox:createMachine', async (_event, args: InstaboxCreateMachineRequest) => {
    const client = account.client()
    const operation = await client.waitForOperation(await client.createMachine(args))
    const [machine, templates] = await Promise.all([
      client.getMachine(operation.machineId),
      client.templates()
    ])
    await ensureEnvironment(machine, templates)
    return machine
  })

  ipcMain.removeHandler('instabox:machineAction')
  ipcMain.handle(
    'instabox:machineAction',
    async (_event, args: { machineId: string; action: InstaboxMachineAction }) => {
      const client = account.client()
      await client.waitForOperation(await client.machineAction(args.machineId, args.action))
      const [machine, templates] = await Promise.all([
        client.getMachine(args.machineId),
        client.templates()
      ])
      await ensureEnvironment(machine, templates)
      // Why: Orca's sockets reconnect on their own backoff; tell the renderer to retry now.
      broadcast(INSTABOX_ENVIRONMENTS_CHANGED_CHANNEL)
      return machine
    }
  )

  ipcMain.removeHandler('instabox:saveSnapshot')
  ipcMain.handle(
    'instabox:saveSnapshot',
    (_event, args: { machineId: string; name: string }): Promise<InstaboxSnapshot> =>
      account.client().createSnapshot(args.machineId, args.name)
  )

  ipcMain.removeHandler('instabox:deleteMachine')
  ipcMain.handle('instabox:deleteMachine', async (_event, args: { machineId: string }) => {
    const client = account.client()
    await client.waitForOperation(await client.deleteMachine(args.machineId))
    envs.forget(args.machineId)
  })

  ipcMain.removeHandler('instabox:connectMachine')
  ipcMain.handle('instabox:connectMachine', async (_event, args: { machineId: string }) =>
    redactRuntimeEnvironment(await envs.connect(args.machineId))
  )
}
