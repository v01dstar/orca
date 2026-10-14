import { useCallback, useEffect, useRef, useState } from 'react'
import {
  INSTABOX_ORCA_CAPABILITY,
  instaboxOrcaMachines,
  instaboxOrcaSnapshots,
  type InstaboxCreateMachineRequest,
  type InstaboxDeviceStart,
  type InstaboxSnapshot,
  type InstaboxMachine,
  type InstaboxMachineAction,
  type InstaboxTemplate
} from '../../../src/shared/instabox/instabox-api-types'
import type { InstaboxStoredSession } from '../../../src/shared/instabox/instabox-token-source'
import { useForgetHostClient } from '../transport/client-context'
import { removeHostAndCloseClient } from '../transport/host-removal-lifecycle'
import { loadHosts } from '../transport/host-store'
import { addInstaboxMachineAsHost } from './instabox-host-enrollment'
import { addNewInstaboxMachineAsHost } from './instabox-new-machine-enrollment'
import {
  instaboxClient,
  loadInstaboxSession,
  onInstaboxSessionChange,
  signInToInstabox,
  signOutOfInstabox
} from './instabox-mobile-session'

// What a new machine is created from: a template, or a saved snapshot of a machine.
export type InstaboxMachineSource = { templateId: string } | { snapshotId: string }

export type InstaboxMachineRowModel = {
  machine: InstaboxMachine
  hostId: string | null
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function useInstaboxMachines() {
  const [session, setSession] = useState<InstaboxStoredSession | null>(null)
  const [machines, setMachines] = useState<InstaboxMachineRowModel[]>([])
  const [templates, setTemplates] = useState<InstaboxTemplate[]>([])
  const [snapshots, setSnapshots] = useState<InstaboxSnapshot[]>([])
  const [deviceCode, setDeviceCode] = useState<InstaboxDeviceStart | null>(null)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const signInAbort = useRef<AbortController | null>(null)
  const forgetHostClient = useForgetHostClient()

  const refresh = useCallback(async () => {
    if (!(await loadInstaboxSession())) {
      setMachines([])
      return
    }
    setLoading(true)
    try {
      const client = instaboxClient()
      const [list, nextTemplates, nextSnapshots, hosts] = await Promise.all([
        client.listMachines(),
        client.templates(),
        client.listSnapshots(),
        loadHosts()
      ])
      const hostIds = new Set(hosts.map((host) => host.id))
      setTemplates(nextTemplates)
      setSnapshots(instaboxOrcaSnapshots(nextSnapshots, nextTemplates))
      setMachines(
        instaboxOrcaMachines(list, nextTemplates).map((machine) => ({
          machine,
          hostId: hostIds.has(`instabox-${machine.id}`) ? `instabox-${machine.id}` : null
        }))
      )
      setError(null)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInstaboxSession().then(setSession)
    void refresh()
    return onInstaboxSessionChange((next) => {
      setSession(next)
      void refresh()
    })
  }, [refresh])

  const signIn = async (serverUrl: string): Promise<void> => {
    signInAbort.current?.abort()
    const abort = new AbortController()
    signInAbort.current = abort
    setError(null)
    try {
      await signInToInstabox(serverUrl, setDeviceCode, abort.signal)
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(message(e))
      }
    } finally {
      setDeviceCode(null)
    }
  }

  const run = async (machineId: string, label: string, task: () => Promise<unknown>) => {
    setBusy((current) => ({ ...current, [machineId]: label }))
    try {
      await task()
      setError(null)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(({ [machineId]: _done, ...rest }) => rest)
      await refresh()
    }
  }

  return {
    session,
    machines,
    templates: templates.filter((t) => (t.capabilities ?? []).includes(INSTABOX_ORCA_CAPABILITY)),
    snapshots,
    deviceCode,
    busy,
    error,
    loading,
    refresh,
    signIn,
    cancelSignIn: () => signInAbort.current?.abort(),
    signOut: () => signOutOfInstabox(),
    act: (machine: InstaboxMachine, action: InstaboxMachineAction, label: string) =>
      run(machine.id, label, async () => {
        const client = instaboxClient()
        await client.waitForOperation(await client.machineAction(machine.id, action))
      }),
    addToOrca: (machine: InstaboxMachine) =>
      run(machine.id, 'Adding to Orca…', () => addInstaboxMachineAsHost(machine)),
    // Resolves once created; adding to Orca continues on the machine's row.
    create: async (name: string, source: InstaboxMachineSource) => {
      const created: { machineId?: string } = {}
      await run(`new:${name}`, 'Creating…', async () => {
        const client = instaboxClient()
        const request: InstaboxCreateMachineRequest =
          'snapshotId' in source
            ? { name, snapshotId: source.snapshotId }
            : { name, templateId: source.templateId }
        const operation = await client.waitForOperation(await client.createMachine(request))
        created.machineId = operation.machineId
      })
      const id = created.machineId
      if (id) {
        void run(id, 'Adding to Orca…', () =>
          addNewInstaboxMachineAsHost(id).catch((e: unknown) => {
            throw new Error(`${name} was created but not added to Orca: ${message(e)}`)
          })
        )
      }
    },
    // Forget the Orca host first, while the machine can still answer its push unregister.
    deleteMachine: (machine: InstaboxMachine, hostId: string | null) =>
      run(machine.id, 'Deleting…', async () => {
        if (hostId) {
          await removeHostAndCloseClient(hostId, forgetHostClient)
        }
        const client = instaboxClient()
        await client.waitForOperation(await client.deleteMachine(machine.id))
      }),
    saveSnapshot: (machine: InstaboxMachine, name: string) =>
      run(machine.id, 'Saving snapshot…', () => instaboxClient().createSnapshot(machine.id, name))
  }
}
