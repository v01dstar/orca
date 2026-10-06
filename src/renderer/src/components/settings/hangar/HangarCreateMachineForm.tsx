import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  hangarOrcaTemplates,
  isValidHangarName,
  type HangarCreateMachineRequest,
  type HangarImage,
  type HangarTemplate
} from '../../../../../shared/hangar/hangar-api-types'
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

const NS = 'auto.components.settings.hangar.HangarCreateMachineForm'

type HangarCreateMachineFormProps = {
  templates: readonly HangarTemplate[]
  // Orca-capable images (saved stopped machines) a machine can also be created from.
  images: readonly HangarImage[]
  creating: boolean
  onCancel: () => void
  onCreate: (request: HangarCreateMachineRequest) => void
}

export function HangarCreateMachineForm({
  templates,
  images,
  creating,
  onCancel,
  onCreate
}: HangarCreateMachineFormProps): React.JSX.Element {
  const orcaTemplates = hangarOrcaTemplates(templates)
  const [name, setName] = useState('')
  // `template:<id>` or `image:<id>`: one Select picks either source.
  const [source, setSource] = useState(orcaTemplates[0] ? `template:${orcaTemplates[0].id}` : '')
  const validName = isValidHangarName(name)
  const request = (): HangarCreateMachineRequest | null => {
    const separator = source.indexOf(':')
    const id = source.slice(separator + 1)
    if (!validName || separator === -1 || !id) {
      return null
    }
    return source.startsWith('image:') ? { name, imageId: id } : { name, templateId: id }
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
          {images.length > 0 ? (
            <SelectGroup>
              <SelectLabel>{translate(`${NS}.images`, 'Images')}</SelectLabel>
              {images.map((image) => (
                <SelectItem key={image.id} value={`image:${image.id}`}>
                  {image.name}
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
