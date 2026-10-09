import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  InstaboxCreateMachineRequest,
  InstaboxMachineAction
} from '../../../../../shared/instabox/instabox-api-types'
import type {
  InstaboxAccountState,
  InstaboxMachinesListing
} from '../../../../../shared/instabox/instabox-ipc'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'

// What a row is doing right now; drives its stage label (operations take seconds to a minute).
export type InstaboxMachineBusy = InstaboxMachineAction | 'delete' | 'connect' | 'saveSnapshot'

async function refreshRuntimeEnvironments(): Promise<void> {
  useAppStore.getState().setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': /, '')
    : String(error)
}

export function useInstaboxMachines(active: boolean) {
  const mountedRef = useMountedRef()
  const [account, setAccount] = useState<InstaboxAccountState | null>(null)
  const [listing, setListing] = useState<InstaboxMachinesListing | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<Record<string, InstaboxMachineBusy>>({})

  const refresh = useCallback(async (): Promise<void> => {
    const state = await window.api.instabox.getState()
    if (!mountedRef.current) {
      return
    }
    setAccount(state)
    if (!state.signedIn) {
      setListing(null)
      return
    }
    setIsLoading(true)
    try {
      const next = await window.api.instabox.listMachines()
      if (mountedRef.current) {
        setListing(next)
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
    return window.api.instabox.onStateChanged(() => void refresh())
  }, [active, refresh])

  const signIn = async (serverUrl: string): Promise<void> => {
    setSigningIn(true)
    try {
      await window.api.instabox.signIn({ serverUrl })
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
    await window.api.instabox.signOut()
    await refresh()
  }

  const runForMachine = async (
    machineId: string,
    kind: InstaboxMachineBusy,
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

  const createMachine = async (request: InstaboxCreateMachineRequest): Promise<boolean> => {
    setCreating(true)
    try {
      await window.api.instabox.createMachine(request)
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
    listing,
    isLoading,
    signingIn,
    creating,
    busy,
    refresh,
    signIn,
    signOut,
    createMachine,
    machineAction: (machineId: string, action: InstaboxMachineAction) =>
      runForMachine(machineId, action, () =>
        window.api.instabox.machineAction({ machineId, action })
      ),
    saveSnapshot: (machineId: string, name: string) =>
      runForMachine(machineId, 'saveSnapshot', () =>
        window.api.instabox.saveSnapshot({ machineId, name })
      ),
    deleteMachine: (machineId: string) =>
      runForMachine(machineId, 'delete', () => window.api.instabox.deleteMachine({ machineId })),
    connectMachine: (machineId: string) =>
      runForMachine(machineId, 'connect', () => window.api.instabox.connectMachine({ machineId }))
  }
}

export type InstaboxMachinesController = ReturnType<typeof useInstaboxMachines>
