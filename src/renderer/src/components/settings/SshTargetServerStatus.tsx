import { ChevronDown } from 'lucide-react'
import type { SshTarget } from '../../../../shared/ssh-types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { Button } from '../ui/button'
import { sshHostServerStatusLine } from '@/ssh/ssh-host-server-status-copy'
import {
  endOldRelayTerminalsLabel,
  useEndOldRelayTerminalsAction
} from '@/ssh/ssh-old-relay-terminals-action'
import { useSshConnectInFlight } from '@/ssh/ssh-connect-in-flight'
import { SshHostChangedActions } from './SshHostChangedActions'

/** Whether this SSH host's managed Orca server serves it, and why not when it doesn't. */
export function SshTargetServerStatus({
  target,
  onChanged
}: {
  target: SshTarget
  onChanged: () => void
}): React.JSX.Element | null {
  const state = useAppStore((s) => s.sshConnectionStates.get(target.id))
  const line = sshHostServerStatusLine(target, state)
  const endOldTerminals = useEndOldRelayTerminalsAction(target.id)
  const connectInFlight = useSshConnectInFlight(target.id)
  if (!line) {
    return null
  }
  return (
    <div className="space-y-1">
      <p
        className={cn(
          'px-1 text-xs',
          line.tone === 'muted' && 'text-muted-foreground',
          line.tone === 'warning' && 'text-status-warning',
          line.tone === 'destructive' && 'text-destructive'
        )}
      >
        {line.text}
      </p>
      {line.stopHint ? (
        <div className="space-y-1 px-1">
          <p className="text-xs text-muted-foreground">{line.stopHint.lead}</p>
          <pre className="scrollbar-sleek overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground select-text">
            {line.stopHint.command}
          </pre>
        </div>
      ) : null}
      {endOldTerminals ? (
        <div className="flex justify-end px-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={connectInFlight}
            onClick={endOldTerminals}
          >
            {endOldRelayTerminalsLabel()}
          </Button>
        </div>
      ) : null}
      {line.detail ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="xs" className="group">
              {translate('auto.components.settings.sshHostServer.failureDetails', 'Details')}
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="scrollbar-sleek max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {line.detail}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <SshHostChangedActions target={target} onChanged={onChanged} />
    </div>
  )
}
