import { describe, expect, it } from 'vitest'
import { hangarMachineActions, hangarOrcaTemplates } from './hangar-api-types'

describe('hangarMachineActions', () => {
  it('offers only the transitions hangar-server accepts', () => {
    expect(hangarMachineActions('running')).toEqual(['suspend', 'stop'])
    // The server refuses stop on a suspended machine ("start or delete it").
    expect(hangarMachineActions('suspended')).toEqual(['resume'])
    expect(hangarMachineActions('stopped')).toEqual(['start'])
    // The server refuses start from error ("stop or delete it").
    expect(hangarMachineActions('error')).toEqual(['stop'])
    expect(hangarMachineActions('creating')).toEqual([])
  })
})

describe('hangarOrcaTemplates', () => {
  it('keeps one entry per Orca-capable template id', () => {
    const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }
    const herdr = { id: 'herdr', version: '1', defaultSpec: spec, capabilities: [] }
    const orca1 = { id: 'orca', version: '1', defaultSpec: spec, capabilities: ['orca'] }
    const orca2 = { ...orca1, version: '2' }
    // hangar lists herdr first; a phone create must still land on the Orca template.
    expect(hangarOrcaTemplates([herdr, orca1, orca2]).map((t) => [t.id, t.version])).toEqual([
      ['orca', '2']
    ])
  })
})
