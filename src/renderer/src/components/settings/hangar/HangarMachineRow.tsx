import { Loader2, MoreHorizontal } from 'lucide-react'
import {
  hangarMachineActions,
  type HangarMachineAction
} from '../../../../../shared/hangar/hangar-api-types'
import type { HangarMachineEntry } from '../../../../../shared/hangar/hangar-ipc'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../ui/dropdown-menu'
import type { HangarMachineBusy } from './use-hangar-machines'

const NS = 'auto.components.settings.hangar.HangarMachineRow'

function stateLabel(state: string): string {
  switch (state) {
    case 'running':
      return translate(`${NS}.running`, 'Running')
    case 'stopped':
      return translate(`${NS}.stopped`, 'Stopped')
    case 'suspended':
      return translate(`${NS}.suspended`, 'Suspended')
    case 'error':
      return translate(`${NS}.error`, 'Error')
    default:
      // Transitional states (creating, starting, …) read fine as hangar names them.
      return state
  }
}

function busyLabel(busy: HangarMachineBusy): string {
  switch (busy) {
    case 'start':
      return translate(`${NS}.starting`, 'Starting…')
    case 'stop':
      return translate(`${NS}.stopping`, 'Stopping…')
    case 'suspend':
      return translate(`${NS}.suspending`, 'Suspending…')
    case 'resume':
      return translate(`${NS}.resuming`, 'Resuming…')
    case 'delete':
      return translate(`${NS}.deleting`, 'Deleting…')
    case 'connect':
      return translate(`${NS}.connecting`, 'Connecting…')
    case 'saveImage':
      return translate(`${NS}.savingImage`, 'Saving image…')
  }
}

type HangarMachineRowProps = {
  entry: HangarMachineEntry
  busy: HangarMachineBusy | undefined
  disabled: boolean
  onAction: (action: HangarMachineAction) => void
  onConnect: () => void
  onSaveImage: () => void
  onDelete: () => void
}

export function HangarMachineRow({
  entry,
  busy,
  disabled,
  onAction,
  onConnect,
  onSaveImage,
  onDelete
}: HangarMachineRowProps): React.JSX.Element {
  const { machine, orcaCapable, environmentId } = entry
  const running = machine.state === 'running'
  const actions = hangarMachineActions(machine.state)
  const primary: { label: string; run: () => void } | null = actions.includes('start')
    ? { label: translate(`${NS}.start`, 'Start'), run: () => onAction('start') }
    : actions.includes('resume')
      ? { label: translate(`${NS}.resume`, 'Resume'), run: () => onAction('resume') }
      : running && orcaCapable && !environmentId
        ? { label: translate(`${NS}.connect`, 'Connect'), run: onConnect }
        : null
  const spec = `${machine.spec.vcpus} vCPU · ${Math.round(machine.spec.memMiB / 1024)} GiB`
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={cn(
          'size-2 shrink-0 rounded-full',
          machine.state === 'error'
            ? 'bg-destructive'
            : running
              ? 'bg-foreground/70'
              : 'bg-muted-foreground/40'
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">{machine.name}</div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {busy ? busyLabel(busy) : stateLabel(machine.state)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {machine.template.id}@{machine.template.version} · {spec}
          {environmentId
            ? ` · ${translate(`${NS}.connected`, 'Connected in Orca')}`
            : orcaCapable
              ? ''
              : ` · ${translate(`${NS}.noOrca`, 'Template without Orca')}`}
        </p>
        {machine.lastError ? (
          <p className="mt-0.5 truncate text-xs text-destructive">{machine.lastError.message}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        {primary && !busy ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={primary.run}
            disabled={disabled}
          >
            {primary.label}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate(`${NS}.more`, 'More machine actions')}
              disabled={disabled || busy !== undefined}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.includes('suspend') ? (
              <DropdownMenuItem onSelect={() => onAction('suspend')}>
                {translate(`${NS}.suspend`, 'Suspend')}
              </DropdownMenuItem>
            ) : null}
            {actions.includes('stop') ? (
              <DropdownMenuItem onSelect={() => onAction('stop')}>
                {translate(`${NS}.stop`, 'Stop')}
              </DropdownMenuItem>
            ) : null}
            {running && orcaCapable && environmentId ? (
              <DropdownMenuItem onSelect={onConnect}>
                {translate(`${NS}.reconnect`, 'Re-enroll in Orca')}
              </DropdownMenuItem>
            ) : null}
            {/* hangar saves images only from stopped machines (disks, not RAM). */}
            {machine.state === 'stopped' ? (
              <DropdownMenuItem onSelect={onSaveImage}>
                {translate(`${NS}.saveImage`, 'Save as image…')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              {translate(`${NS}.delete`, 'Delete…')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
