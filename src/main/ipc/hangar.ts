// IPC for hangar (fork): account, machines, and their Orca environments.
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  HANGAR_ORCA_CAPABILITY,
  hangarOrcaImages,
  type HangarCreateMachineRequest,
  type HangarImage,
  type HangarMachine,
  type HangarMachineAction,
  type HangarTemplate
} from '../../shared/hangar/hangar-api-types'
import {
  HANGAR_ENVIRONMENTS_CHANGED_CHANNEL,
  HANGAR_STATE_CHANGED_CHANNEL,
  type HangarMachinesSnapshot
} from '../../shared/hangar/hangar-ipc'
import { redactRuntimeEnvironment } from '../../shared/runtime-environments'
import { HangarAccount } from '../hangar/hangar-account'
import { HangarEnvironments } from '../hangar/hangar-environments'
import { HangarTunnelProxy } from '../hangar/hangar-tunnel-proxy'

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

const supportsOrca = (templates: HangarTemplate[], machine: HangarMachine): boolean =>
  templates.some(
    (t) =>
      t.id === machine.template.id &&
      t.version === machine.template.version &&
      (t.capabilities ?? []).includes(HANGAR_ORCA_CAPABILITY)
  )

export async function registerHangarHandlers(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const account = new HangarAccount(userDataPath)
  let environments: HangarEnvironments | null = null
  const proxy = new HangarTunnelProxy((machineId) => {
    if (!environments) {
      return Promise.reject(new Error('hangar is starting'))
    }
    return environments.resolveTunnel(machineId)
  })
  await proxy.start()
  environments = new HangarEnvironments(userDataPath, account, proxy, () =>
    broadcast(HANGAR_ENVIRONMENTS_CHANGED_CHANNEL)
  )
  const envs = environments
  envs.refreshEndpoints()
  account.onChange((state) => broadcast(HANGAR_STATE_CHANGED_CHANNEL, state))
  app.once('will-quit', () => proxy.stop())

  // Why: an Orca environment needs a running machine with an orca-capable template.
  async function ensureEnvironment(machine: HangarMachine, templates: HangarTemplate[]) {
    const linked = envs.links().some((link) => link.machineId === machine.id)
    if (!linked && machine.state === 'running' && supportsOrca(templates, machine)) {
      await envs.connect(machine)
    }
  }

  ipcMain.removeHandler('hangar:getState')
  ipcMain.handle('hangar:getState', () => account.state())

  ipcMain.removeHandler('hangar:signIn')
  ipcMain.handle('hangar:signIn', (_event, args: { serverUrl: string }) =>
    account.signIn(args.serverUrl)
  )

  ipcMain.removeHandler('hangar:signOut')
  ipcMain.handle('hangar:signOut', () => account.signOut())

  ipcMain.removeHandler('hangar:listMachines')
  ipcMain.handle('hangar:listMachines', async (): Promise<HangarMachinesSnapshot> => {
    const client = account.client()
    const [machines, templates, images] = await Promise.all([
      client.listMachines(),
      client.templates(),
      client.listImages()
    ])
    const links = envs.links()
    return {
      machines: machines.map((machine) => ({
        machine,
        orcaCapable: supportsOrca(templates, machine),
        environmentId: links.find((link) => link.machineId === machine.id)?.environmentId ?? null
      })),
      templates,
      images: hangarOrcaImages(images, templates)
    }
  })

  ipcMain.removeHandler('hangar:createMachine')
  ipcMain.handle('hangar:createMachine', async (_event, args: HangarCreateMachineRequest) => {
    const client = account.client()
    const operation = await client.waitForOperation(await client.createMachine(args))
    const [machine, templates] = await Promise.all([
      client.getMachine(operation.machineId),
      client.templates()
    ])
    await ensureEnvironment(machine, templates)
    return machine
  })

  ipcMain.removeHandler('hangar:machineAction')
  ipcMain.handle(
    'hangar:machineAction',
    async (_event, args: { machineId: string; action: HangarMachineAction }) => {
      const client = account.client()
      await client.waitForOperation(await client.machineAction(args.machineId, args.action))
      const [machine, templates] = await Promise.all([
        client.getMachine(args.machineId),
        client.templates()
      ])
      await ensureEnvironment(machine, templates)
      // Why: Orca's sockets reconnect on their own backoff; tell the renderer to retry now.
      broadcast(HANGAR_ENVIRONMENTS_CHANGED_CHANNEL)
      return machine
    }
  )

  ipcMain.removeHandler('hangar:saveImage')
  ipcMain.handle(
    'hangar:saveImage',
    (_event, args: { machineId: string; name: string }): Promise<HangarImage> =>
      account.client().createImage(args.machineId, args.name)
  )

  ipcMain.removeHandler('hangar:deleteMachine')
  ipcMain.handle('hangar:deleteMachine', async (_event, args: { machineId: string }) => {
    const client = account.client()
    await client.waitForOperation(await client.deleteMachine(args.machineId))
    envs.forget(args.machineId)
  })

  ipcMain.removeHandler('hangar:connectMachine')
  ipcMain.handle('hangar:connectMachine', async (_event, args: { machineId: string }) =>
    redactRuntimeEnvironment(await envs.connect(args.machineId))
  )
}
