import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  instaboxOrcaTemplates,
  isValidInstaboxName,
  type InstaboxCreateMachineRequest,
  type InstaboxSnapshot,
  type InstaboxTemplate
} from '../../../../../shared/instabox/instabox-api-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '../../ui/select'

const NS = 'auto.components.settings.instabox.InstaboxCreateMachineForm'

type InstaboxCreateMachineFormProps = {
  templates: readonly InstaboxTemplate[]
  // Orca-capable snapshots (saved stopped machines) a machine can also be created from.
  snapshots: readonly InstaboxSnapshot[]
  creating: boolean
  onCancel: () => void
  onCreate: (request: InstaboxCreateMachineRequest) => void
}

export function InstaboxCreateMachineForm({
  templates,
  snapshots,
  creating,
  onCancel,
  onCreate
}: InstaboxCreateMachineFormProps): React.JSX.Element {
  const orcaTemplates = instaboxOrcaTemplates(templates)
  const [name, setName] = useState('')
  // `template:<id>` or `snapshot:<id>`: one Select picks either source.
  const [source, setSource] = useState(orcaTemplates[0] ? `template:${orcaTemplates[0].id}` : '')
  const validName = isValidInstaboxName(name)
  const request = (): InstaboxCreateMachineRequest | null => {
    const separator = source.indexOf(':')
    const id = source.slice(separator + 1)
    if (!validName || separator === -1 || !id) {
      return null
    }
    return source.startsWith('snapshot:') ? { name, snapshotId: id } : { name, templateId: id }
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const next = request()
        if (next) {
          onCreate(next)
        }
      }}
    >
      <Input
        autoFocus
        className="h-8 flex-1"
        placeholder={translate(`${NS}.namePlaceholder`, 'machine-name')}
        value={name}
        onChange={(event) => setName(event.target.value.toLowerCase())}
        aria-label={translate(`${NS}.name`, 'Machine name')}
        aria-invalid={name.length > 0 && !validName}
        disabled={creating}
      />
      <Select value={source} onValueChange={setSource} disabled={creating}>
        <SelectTrigger
          size="sm"
          className="w-40"
          aria-label={translate(`${NS}.template`, 'Template')}
        >
          <SelectValue placeholder={translate(`${NS}.noTemplate`, 'No Orca template')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{translate(`${NS}.templates`, 'Templates')}</SelectLabel>
            {orcaTemplates.map((template) => (
              <SelectItem key={template.id} value={`template:${template.id}`}>
                {template.id}
              </SelectItem>
            ))}
          </SelectGroup>
          {snapshots.length > 0 ? (
            <SelectGroup>
              <SelectLabel>{translate(`${NS}.snapshots`, 'Snapshots')}</SelectLabel>
              {snapshots.map((snapshot) => (
                <SelectItem key={snapshot.id} value={`snapshot:${snapshot.id}`}>
                  {snapshot.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
        {translate(`${NS}.cancel`, 'Cancel')}
      </Button>
      <Button type="submit" size="sm" className="w-36" disabled={creating || request() === null}>
        {creating ? <Loader2 className="animate-spin" /> : null}
        {creating
          ? translate(`${NS}.creating`, 'Creating machine…')
          : translate(`${NS}.create`, 'Create machine')}
      </Button>
    </form>
  )
}
