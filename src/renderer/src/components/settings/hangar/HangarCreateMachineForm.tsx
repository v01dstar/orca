import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  HANGAR_ORCA_CAPABILITY,
  type HangarCreateMachineRequest,
  type HangarTemplate
} from '../../../../../shared/hangar/hangar-api-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'

const NS = 'auto.components.settings.hangar.HangarCreateMachineForm'

type HangarCreateMachineFormProps = {
  templates: readonly HangarTemplate[]
  creating: boolean
  onCancel: () => void
  onCreate: (request: HangarCreateMachineRequest) => void
}

export function HangarCreateMachineForm({
  templates,
  creating,
  onCancel,
  onCreate
}: HangarCreateMachineFormProps): React.JSX.Element {
  // Why: only templates that run an Orca runtime can become Orca hosts.
  const orcaTemplates = [
    ...new Map(
      templates
        .filter((template) => (template.capabilities ?? []).includes(HANGAR_ORCA_CAPABILITY))
        .map((template) => [template.id, template])
    ).values()
  ]
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState(orcaTemplates[0]?.id ?? '')
  // Same rule as hangar's machine names (internal/server/machines.go nameRE).
  const validName = /^[a-z0-9][a-z0-9-]{0,62}$/.test(name)

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (validName && templateId) {
          onCreate({ name, templateId })
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
      <Select value={templateId} onValueChange={setTemplateId} disabled={creating}>
        <SelectTrigger
          size="sm"
          className="w-40"
          aria-label={translate(`${NS}.template`, 'Template')}
        >
          <SelectValue placeholder={translate(`${NS}.noTemplate`, 'No Orca template')} />
        </SelectTrigger>
        <SelectContent>
          {orcaTemplates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
        {translate(`${NS}.cancel`, 'Cancel')}
      </Button>
      <Button
        type="submit"
        size="sm"
        className="w-36"
        disabled={creating || !validName || !templateId}
      >
        {creating ? <Loader2 className="animate-spin" /> : null}
        {creating
          ? translate(`${NS}.creating`, 'Creating machine…')
          : translate(`${NS}.create`, 'Create machine')}
      </Button>
    </form>
  )
}
