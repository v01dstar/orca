import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  HangarCreateMachineRequest,
  HangarMachineAction
} from '../../../../../shared/hangar/hangar-api-types'
import type {
  HangarAccountState,
  HangarMachinesSnapshot
} from '../../../../../shared/hangar/hangar-ipc'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'

// What a row is doing right now; drives its stage label (operations take seconds to a minute).
export type HangarMachineBusy = HangarMachineAction | 'delete' | 'connect'

async function refreshRuntimeEnvironments(): Promise<void> {
  useAppStore.getState().setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': /, '')
    : String(error)
}

export function useHangarMachines(active: boolean) {
  const mountedRef = useMountedRef()
  const [account, setAccount] = useState<HangarAccountState | null>(null)
  const [snapshot, setSnapshot] = useState<HangarMachinesSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<Record<string, HangarMachineBusy>>({})

  const refresh = useCallback(async (): Promise<void> => {
    const state = await window.api.hangar.getState()
    if (!mountedRef.current) {
      return
    }
    setAccount(state)
    if (!state.signedIn) {
      setSnapshot(null)
      return
    }
    setIsLoading(true)
    try {
      const next = await window.api.hangar.listMachines()
      if (mountedRef.current) {
        setSnapshot(next)
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(errorMessage(error))
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    if (!active) {
      return
    }
    void refresh()
    const offState = window.api.hangar.onStateChanged(() => void refresh())
    const offEnvironments = window.api.hangar.onEnvironmentsChanged(
      () => void refreshRuntimeEnvironments()
    )
    return () => {
      offState()
      offEnvironments()
    }
  }, [active, refresh])

  const signIn = async (serverUrl: string): Promise<void> => {
    setSigningIn(true)
    try {
      await window.api.hangar.signIn({ serverUrl })
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      if (mountedRef.current) {
        setSigningIn(false)
      }
    }
  }

  const signOut = async (): Promise<void> => {
    await window.api.hangar.signOut()
    await refresh()
  }

  const runForMachine = async (
    machineId: string,
    kind: HangarMachineBusy,
    run: () => Promise<unknown>
  ): Promise<void> => {
    setBusy((current) => ({ ...current, [machineId]: kind }))
    try {
      await run()
      await refreshRuntimeEnvironments()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      if (mountedRef.current) {
        setBusy(({ [machineId]: _done, ...rest }) => rest)
        await refresh()
      }
    }
  }

  const createMachine = async (request: HangarCreateMachineRequest): Promise<boolean> => {
    setCreating(true)
    try {
      await window.api.hangar.createMachine(request)
      await refreshRuntimeEnvironments()
      await refresh()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    } finally {
      if (mountedRef.current) {
        setCreating(false)
      }
    }
  }

  return {
    account,
    snapshot,
    isLoading,
    signingIn,
    creating,
    busy,
    refresh,
    signIn,
    signOut,
    createMachine,
    machineAction: (machineId: string, action: HangarMachineAction) =>
      runForMachine(machineId, action, () =>
        window.api.hangar.machineAction({ machineId, action })
      ),
    deleteMachine: (machineId: string) =>
      runForMachine(machineId, 'delete', () => window.api.hangar.deleteMachine({ machineId })),
    connectMachine: (machineId: string) =>
      runForMachine(machineId, 'connect', () => window.api.hangar.connectMachine({ machineId }))
  }
}

export type HangarMachinesController = ReturnType<typeof useHangarMachines>
