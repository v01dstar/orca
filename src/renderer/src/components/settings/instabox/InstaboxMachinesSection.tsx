import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { InstaboxMachineEntry } from '../../../../../shared/instabox/instabox-ipc'
import { INSTABOX_DEFAULT_SERVER_URL } from '../../../../../shared/instabox/instabox-api-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { InstaboxCreateMachineForm } from './InstaboxCreateMachineForm'
import { InstaboxDeleteMachineDialog } from './InstaboxDeleteMachineDialog'
import { InstaboxMachineRow } from './InstaboxMachineRow'
import { InstaboxSaveSnapshotDialog } from './InstaboxSaveSnapshotDialog'
import { useInstaboxMachines } from './use-instabox-machines'

const NS = 'auto.components.settings.instabox.InstaboxMachinesSection'

// Why: the web client's window.api has no instabox bridge; instabox lives in the desktop main process.
export function InstaboxMachinesSection({ active }: { active: boolean }): React.JSX.Element | null {
  return 'instabox' in window.api ? <InstaboxMachinesPanel active={active} /> : null
}

function InstaboxMachinesPanel({ active }: { active: boolean }): React.JSX.Element {
  const instabox = useInstaboxMachines(active)
  const [serverUrl, setServerUrl] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<InstaboxMachineEntry | null>(null)
  const [pendingSnapshot, setPendingSnapshot] = useState<InstaboxMachineEntry | null>(null)
  const account = instabox.account
  const machines = instabox.listing?.machines ?? []

  return (
    <div className="space-y-3 pt-2" data-settings-section="instabox-machines">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium">{translate(`${NS}.title`, 'Instabox machines')}</div>
          <p className="truncate text-xs text-muted-foreground">
            {account?.signedIn
              ? `${account.login} · ${account.serverUrl}`
              : translate(
                  `${NS}.description`,
                  'Run Orca on your Instabox cloud machines. Signing in to Instabox is all it takes; nothing is paired.'
                )}
          </p>
        </div>
        {account?.signedIn ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={translate(`${NS}.refresh`, 'Refresh Instabox machines')}
              title={translate(`${NS}.refresh`, 'Refresh Instabox machines')}
              onClick={() => void instabox.refresh()}
              disabled={instabox.isLoading}
            >
              {instabox.isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void instabox.signOut()}>
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
            void instabox.signIn(serverUrl || account.serverUrl || INSTABOX_DEFAULT_SERVER_URL)
          }}
        >
          <Input
            className="h-8 flex-1"
            placeholder={account.serverUrl ?? INSTABOX_DEFAULT_SERVER_URL}
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            aria-label={translate(`${NS}.serverUrl`, 'Instabox server URL')}
            disabled={instabox.signingIn}
          />
          <Button type="submit" size="sm" className="w-56" disabled={instabox.signingIn}>
            {instabox.signingIn ? <Loader2 className="animate-spin" /> : null}
            {instabox.signingIn
              ? translate(`${NS}.waitingForBrowser`, 'Waiting for browser sign-in…')
              : translate(`${NS}.signIn`, 'Sign in to Instabox')}
          </Button>
        </form>
      ) : null}

      {account?.signedIn ? (
        <div className="rounded-lg border border-border/50 bg-card/30">
          {machines.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {instabox.isLoading
                ? translate(`${NS}.loading`, 'Checking Instabox machines…')
                : translate(`${NS}.empty`, 'No Instabox machines yet.')}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {machines.map((entry) => (
                <InstaboxMachineRow
                  key={entry.machine.id}
                  entry={entry}
                  busy={instabox.busy[entry.machine.id]}
                  disabled={instabox.isLoading}
                  onAction={(action) => void instabox.machineAction(entry.machine.id, action)}
                  onConnect={() => void instabox.connectMachine(entry.machine.id)}
                  onSaveSnapshot={() => setPendingSnapshot(entry)}
                  onDelete={() => setPendingDelete(entry)}
                />
              ))}
            </div>
          )}
          <div className="border-t border-border/50 px-4 py-3">
            {createOpen ? (
              <InstaboxCreateMachineForm
                templates={instabox.listing?.templates ?? []}
                snapshots={instabox.listing?.snapshots ?? []}
                creating={instabox.creating}
                onCancel={() => setCreateOpen(false)}
                onCreate={async (request) => {
                  if (await instabox.createMachine(request)) {
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

      <InstaboxSaveSnapshotDialog
        entry={pendingSnapshot}
        onCancel={() => setPendingSnapshot(null)}
        onSave={(name) => {
          if (pendingSnapshot) {
            void instabox.saveSnapshot(pendingSnapshot.machine.id, name)
          }
          setPendingSnapshot(null)
        }}
      />
      <InstaboxDeleteMachineDialog
        entry={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void instabox.deleteMachine(pendingDelete.machine.id)
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
