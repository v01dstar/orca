import { useEffect, useState } from 'react'
import { isValidHangarName } from '../../../../../shared/hangar/hangar-api-types'
import type { HangarMachineEntry } from '../../../../../shared/hangar/hangar-ipc'
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

const NS = 'auto.components.settings.hangar.HangarSaveImageDialog'

type HangarSaveImageDialogProps = {
  entry: HangarMachineEntry | null
  onCancel: () => void
  onSave: (name: string) => void
}

export function HangarSaveImageDialog({
  entry,
  onCancel,
  onSave
}: HangarSaveImageDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  useEffect(() => {
    if (entry) {
      setName(`${entry.machine.name}-image`.slice(0, 63))
    }
  }, [entry])
  const validName = isValidHangarName(name)

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
            <DialogTitle>{translate(`${NS}.title`, 'Save machine as image')}</DialogTitle>
            <DialogDescription>
              {translate(
                `${NS}.description`,
                'Saves the root and /data disks, including anything signed in under the home directory. Memory and running processes are not saved. New machines can be created from the image.'
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value.toLowerCase())}
            aria-label={translate(`${NS}.name`, 'Image name')}
            aria-invalid={name.length > 0 && !validName}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {translate(`${NS}.cancel`, 'Cancel')}
            </Button>
            <Button type="submit" disabled={!validName}>
              {translate(`${NS}.save`, 'Save image')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
