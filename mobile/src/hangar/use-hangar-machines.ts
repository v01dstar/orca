import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HANGAR_ORCA_CAPABILITY,
  hangarOrcaImages,
  type HangarCreateMachineRequest,
  type HangarDeviceStart,
  type HangarImage,
  type HangarMachine,
  type HangarMachineAction,
  type HangarTemplate
} from '../../../src/shared/hangar/hangar-api-types'
import type { HangarStoredSession } from '../../../src/shared/hangar/hangar-token-source'
import { loadHosts } from '../transport/host-store'
import { addHangarMachineAsHost } from './hangar-host-enrollment'
import {
  hangarClient,
  loadHangarSession,
  onHangarSessionChange,
  signInToHangar,
  signOutOfHangar
} from './hangar-mobile-session'

// What a new machine is created from: a template, or a saved image of a stopped machine.
export type HangarMachineSource = { templateId: string } | { imageId: string }

export type HangarMachineRowModel = {
  machine: HangarMachine
  orcaCapable: boolean
  hostId: string | null
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function useHangarMachines() {
  const [session, setSession] = useState<HangarStoredSession | null>(null)
  const [machines, setMachines] = useState<HangarMachineRowModel[]>([])
  const [templates, setTemplates] = useState<HangarTemplate[]>([])
  const [images, setImages] = useState<HangarImage[]>([])
  const [deviceCode, setDeviceCode] = useState<HangarDeviceStart | null>(null)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const signInAbort = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!(await loadHangarSession())) {
      setMachines([])
      return
    }
    setLoading(true)
    try {
      const client = hangarClient()
      const [list, nextTemplates, nextImages, hosts] = await Promise.all([
        client.listMachines(),
        client.templates(),
        client.listImages(),
        loadHosts()
      ])
      const hostIds = new Set(hosts.map((host) => host.id))
      setTemplates(nextTemplates)
      setImages(hangarOrcaImages(nextImages, nextTemplates))
      setMachines(
        list.map((machine) => ({
          machine,
          orcaCapable: nextTemplates.some(
            (t) =>
              t.id === machine.template.id &&
              t.version === machine.template.version &&
              (t.capabilities ?? []).includes(HANGAR_ORCA_CAPABILITY)
          ),
          hostId: hostIds.has(`hangar-${machine.id}`) ? `hangar-${machine.id}` : null
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
    void loadHangarSession().then(setSession)
    void refresh()
    return onHangarSessionChange((next) => {
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
      await signInToHangar(serverUrl, setDeviceCode, abort.signal)
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
    templates: templates.filter((t) => (t.capabilities ?? []).includes(HANGAR_ORCA_CAPABILITY)),
    images,
    deviceCode,
    busy,
    error,
    loading,
    refresh,
    signIn,
    cancelSignIn: () => signInAbort.current?.abort(),
    signOut: () => signOutOfHangar(),
    act: (machine: HangarMachine, action: HangarMachineAction, label: string) =>
      run(machine.id, label, async () => {
        const client = hangarClient()
        await client.waitForOperation(await client.machineAction(machine.id, action))
      }),
    addToOrca: (machine: HangarMachine) =>
      run(machine.id, 'Adding to Orca…', () => addHangarMachineAsHost(machine)),
    create: (name: string, source: HangarMachineSource) =>
      run(`new:${name}`, 'Creating…', async () => {
        const client = hangarClient()
        const request: HangarCreateMachineRequest =
          'imageId' in source
            ? { name, imageId: source.imageId }
            : { name, templateId: source.templateId }
        await client.waitForOperation(await client.createMachine(request))
      }),
    saveImage: (machine: HangarMachine, name: string) =>
      run(machine.id, 'Saving image…', () => hangarClient().createImage(machine.id, name))
  }
}
