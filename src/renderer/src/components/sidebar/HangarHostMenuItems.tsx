import { Pause, Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { HangarMachineAction } from '../../../../shared/hangar/hangar-api-types'
import type { HangarMachineEntry } from '../../../../shared/hangar/hangar-ipc'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { DropdownMenuItem } from '../ui/dropdown-menu'

const NS = 'auto.components.sidebar.HangarHostMenuItems'

function actionLabels(action: HangarMachineAction): {
  item: string
  pending: string
  done: string
} {
  switch (action) {
    case 'start':
      return {
        item: translate(`${NS}.start`, 'Start machine'),
        pending: translate(`${NS}.starting`, 'Starting hangar machine…'),
        done: translate(`${NS}.started`, 'hangar machine is running.')
      }
    case 'resume':
      return {
        item: translate(`${NS}.resume`, 'Resume machine'),
        pending: translate(`${NS}.resuming`, 'Resuming hangar machine…'),
        done: translate(`${NS}.resumed`, 'hangar machine is running.')
      }
    case 'suspend':
      return {
        item: translate(`${NS}.suspend`, 'Suspend machine'),
        pending: translate(`${NS}.suspending`, 'Suspending hangar machine…'),
        done: translate(`${NS}.suspended`, 'hangar machine is suspended.')
      }
    case 'stop':
      return {
        item: translate(`${NS}.stop`, 'Stop machine'),
        pending: translate(`${NS}.stopping`, 'Stopping hangar machine…'),
        done: translate(`${NS}.stopped`, 'hangar machine is stopped.')
      }
  }
}

function availableActions(state: string): HangarMachineAction[] {
  switch (state) {
    case 'running':
      return ['suspend', 'stop']
    case 'suspended':
      return ['resume', 'stop']
    case 'stopped':
    case 'error':
      return ['start']
    default:
      return []
  }
}

/** Lifecycle items for a host that is a hangar machine (fork); renders nothing otherwise. */
export function HangarHostMenuItems({ hostId }: { hostId: string }): React.JSX.Element | null {
  const parsed = parseExecutionHostId(hostId)
  const environmentId = parsed?.kind === 'runtime' ? parsed.environmentId : null
  const isHangar = useAppStore((state) =>
    state.runtimeEnvironments.some((env) => env.id === environmentId && env.source === 'hangar')
  )
  const [entry, setEntry] = useState<HangarMachineEntry | null>(null)

  useEffect(() => {
    if (!isHangar || !('hangar' in window.api)) {
      return
    }
    let cancelled = false
    // Why: the menu mounts its items only while open, so this reads the state when it is shown.
    void window.api.hangar
      .listMachines()
      .then((snapshot) => {
        if (!cancelled) {
          setEntry(snapshot.machines.find((m) => m.environmentId === environmentId) ?? null)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isHangar, environmentId])

  if (!entry) {
    return null
  }
  const run = (action: HangarMachineAction): void => {
    const labels = actionLabels(action)
    toast.promise(window.api.hangar.machineAction({ machineId: entry.machine.id, action }), {
      loading: labels.pending,
      success: labels.done,
      error: (error: unknown) => (error instanceof Error ? error.message : String(error))
    })
  }
  return (
    <>
      {availableActions(entry.machine.state).map((action) => (
        <DropdownMenuItem key={action} onSelect={() => run(action)}>
          {action === 'suspend' ? (
            <Pause className="size-3.5" />
          ) : action === 'stop' ? (
            <Square className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {actionLabels(action).item}
        </DropdownMenuItem>
      ))}
    </>
  )
}
