import { Pause, Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { InstaboxMachineAction } from '../../../../shared/instabox/instabox-api-types'
import type { InstaboxMachineEntry } from '../../../../shared/instabox/instabox-ipc'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { DropdownMenuItem } from '../ui/dropdown-menu'

const NS = 'auto.components.sidebar.InstaboxHostMenuItems'

function actionLabels(action: InstaboxMachineAction): {
  item: string
  pending: string
  done: string
} {
  switch (action) {
    case 'start':
      return {
        item: translate(`${NS}.start`, 'Start machine'),
        pending: translate(`${NS}.starting`, 'Starting Instabox machine…'),
        done: translate(`${NS}.started`, 'Instabox machine is running.')
      }
    case 'resume':
      return {
        item: translate(`${NS}.resume`, 'Resume machine'),
        pending: translate(`${NS}.resuming`, 'Resuming Instabox machine…'),
        done: translate(`${NS}.resumed`, 'Instabox machine is running.')
      }
    case 'suspend':
      return {
        item: translate(`${NS}.suspend`, 'Suspend machine'),
        pending: translate(`${NS}.suspending`, 'Suspending Instabox machine…'),
        done: translate(`${NS}.suspended`, 'Instabox machine is suspended.')
      }
    case 'stop':
      return {
        item: translate(`${NS}.stop`, 'Stop machine'),
        pending: translate(`${NS}.stopping`, 'Stopping Instabox machine…'),
        done: translate(`${NS}.stopped`, 'Instabox machine is stopped.')
      }
  }
}

function availableActions(state: string): InstaboxMachineAction[] {
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

/** Lifecycle items for a host that is an instabox machine (fork); renders nothing otherwise. */
export function InstaboxHostMenuItems({ hostId }: { hostId: string }): React.JSX.Element | null {
  const parsed = parseExecutionHostId(hostId)
  const environmentId = parsed?.kind === 'runtime' ? parsed.environmentId : null
  const isInstabox = useAppStore((state) =>
    state.runtimeEnvironments.some((env) => env.id === environmentId && env.source === 'instabox')
  )
  const [entry, setEntry] = useState<InstaboxMachineEntry | null>(null)

  useEffect(() => {
    if (!isInstabox || !('instabox' in window.api)) {
      return
    }
    let cancelled = false
    // Why: the menu mounts its items only while open, so this reads the state when it is shown.
    void window.api.instabox
      .listMachines()
      .then((listing) => {
        if (!cancelled) {
          setEntry(listing.machines.find((m) => m.environmentId === environmentId) ?? null)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isInstabox, environmentId])

  if (!entry) {
    return null
  }
  const run = (action: InstaboxMachineAction): void => {
    const labels = actionLabels(action)
    toast.promise(window.api.instabox.machineAction({ machineId: entry.machine.id, action }), {
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
