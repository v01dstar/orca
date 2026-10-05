import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { HangarMachineEntry } from '../../../../../shared/hangar/hangar-ipc'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { HangarCreateMachineForm } from './HangarCreateMachineForm'
import { HangarDeleteMachineDialog } from './HangarDeleteMachineDialog'
import { HangarMachineRow } from './HangarMachineRow'
import { useHangarMachines } from './use-hangar-machines'

const NS = 'auto.components.settings.hangar.HangarMachinesSection'

// Why: the web client's window.api has no hangar bridge; hangar lives in the desktop main process.
export function HangarMachinesSection({ active }: { active: boolean }): React.JSX.Element | null {
  return 'hangar' in window.api ? <HangarMachinesPanel active={active} /> : null
}

function HangarMachinesPanel({ active }: { active: boolean }): React.JSX.Element {
  const hangar = useHangarMachines(active)
  const [serverUrl, setServerUrl] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HangarMachineEntry | null>(null)
  const account = hangar.account
  const machines = hangar.snapshot?.machines ?? []

  return (
    <div className="space-y-3 pt-2" data-settings-section="hangar-machines">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium">{translate(`${NS}.title`, 'hangar machines')}</div>
          <p className="truncate text-xs text-muted-foreground">
            {account?.signedIn
              ? `${account.login} · ${account.serverUrl}`
              : translate(
                  `${NS}.description`,
                  'Run Orca on your hangar cloud machines. Signing in to hangar is all it takes; nothing is paired.'
                )}
          </p>
        </div>
        {account?.signedIn ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={translate(`${NS}.refresh`, 'Refresh hangar machines')}
              title={translate(`${NS}.refresh`, 'Refresh hangar machines')}
              onClick={() => void hangar.refresh()}
              disabled={hangar.isLoading}
            >
              {hangar.isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void hangar.signOut()}>
              {translate(`${NS}.signOut`, 'Sign out')}
            </Button>
          </div>
        ) : null}
      </div>

      {account && !account.signedIn ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void hangar.signIn(serverUrl || account.serverUrl || '')
          }}
        >
          <Input
            className="h-8 flex-1"
            placeholder={
              account.serverUrl ??
              translate(`${NS}.serverUrlPlaceholder`, 'https://hangar.example.com')
            }
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            aria-label={translate(`${NS}.serverUrl`, 'hangar server URL')}
            disabled={hangar.signingIn}
          />
          <Button
            type="submit"
            size="sm"
            className="w-56"
            disabled={hangar.signingIn || !(serverUrl || account.serverUrl)}
          >
            {hangar.signingIn ? <Loader2 className="animate-spin" /> : null}
            {hangar.signingIn
              ? translate(`${NS}.waitingForBrowser`, 'Waiting for browser sign-in…')
              : translate(`${NS}.signIn`, 'Sign in to hangar')}
          </Button>
        </form>
      ) : null}

      {account?.signedIn ? (
        <div className="rounded-lg border border-border/50 bg-card/30">
          {machines.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {hangar.isLoading
                ? translate(`${NS}.loading`, 'Checking hangar machines…')
                : translate(`${NS}.empty`, 'No hangar machines yet.')}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {machines.map((entry) => (
                <HangarMachineRow
                  key={entry.machine.id}
                  entry={entry}
                  busy={hangar.busy[entry.machine.id]}
                  disabled={hangar.isLoading}
                  onAction={(action) => void hangar.machineAction(entry.machine.id, action)}
                  onConnect={() => void hangar.connectMachine(entry.machine.id)}
                  onDelete={() => setPendingDelete(entry)}
                />
              ))}
            </div>
          )}
          <div className="border-t border-border/50 px-4 py-3">
            {createOpen ? (
              <HangarCreateMachineForm
                templates={hangar.snapshot?.templates ?? []}
                creating={hangar.creating}
                onCancel={() => setCreateOpen(false)}
                onCreate={async (request) => {
                  if (await hangar.createMachine(request)) {
                    setCreateOpen(false)
                  }
                }}
              />
            ) : (
              <Button type="button" variant="ghost" size="xs" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3" />
                {translate(`${NS}.newMachine`, 'New machine')}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <HangarDeleteMachineDialog
        entry={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void hangar.deleteMachine(pendingDelete.machine.id)
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
