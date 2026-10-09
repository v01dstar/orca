import { useEffect, useState } from 'react'
import { isValidInstaboxName } from '../../../../../shared/instabox/instabox-api-types'
import type { InstaboxMachineEntry } from '../../../../../shared/instabox/instabox-ipc'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/dialog'
import { Input } from '../../ui/input'

const NS = 'auto.components.settings.instabox.InstaboxSaveSnapshotDialog'

type InstaboxSaveSnapshotDialogProps = {
  entry: InstaboxMachineEntry | null
  onCancel: () => void
  onSave: (name: string) => void
}

export function InstaboxSaveSnapshotDialog({
  entry,
  onCancel,
  onSave
}: InstaboxSaveSnapshotDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  useEffect(() => {
    if (entry) {
      setName(`${entry.machine.name}-snapshot`.slice(0, 63))
    }
  }, [entry])
  const validName = isValidInstaboxName(name)

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            if (validName) {
              onSave(name)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{translate(`${NS}.title`, 'Save machine as snapshot')}</DialogTitle>
            <DialogDescription>
              {translate(
                `${NS}.description`,
                'Saves the root and /data disks, including anything signed in under the home directory. Memory and running processes are not saved. New machines can be created from the snapshot.'
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value.toLowerCase())}
            aria-label={translate(`${NS}.name`, 'Snapshot name')}
            aria-invalid={name.length > 0 && !validName}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {translate(`${NS}.cancel`, 'Cancel')}
            </Button>
            <Button type="submit" disabled={!validName}>
              {translate(`${NS}.save`, 'Save snapshot')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
