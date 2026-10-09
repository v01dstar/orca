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

const NS = 'auto.components.settings.instabox.InstaboxDeleteMachineDialog'

type InstaboxDeleteMachineDialogProps = {
  entry: InstaboxMachineEntry | null
  onCancel: () => void
  onConfirm: () => void
}

export function InstaboxDeleteMachineDialog({
  entry,
  onCancel,
  onConfirm
}: InstaboxDeleteMachineDialogProps): React.JSX.Element {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(`${NS}.title`, 'Delete Instabox machine?')}</DialogTitle>
          <DialogDescription>
            {translate(
              `${NS}.description`,
              'Deletes the machine with its root and /data disks, and every workspace on it. This cannot be undone.'
            )}
          </DialogDescription>
        </DialogHeader>
        {entry ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            <div className="truncate">{entry.machine.name}</div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {translate(`${NS}.cancel`, 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {translate(`${NS}.confirm`, 'Delete machine')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
