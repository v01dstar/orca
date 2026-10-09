import { describe, expect, it } from 'vitest'
import {
  instaboxMachineActions,
  instaboxOrcaSnapshots,
  instaboxOrcaTemplates,
  isValidInstaboxName
} from './instabox-api-types'

describe('instaboxMachineActions', () => {
  it('offers only the transitions instabox-server accepts', () => {
    expect(instaboxMachineActions('running')).toEqual(['suspend', 'stop'])
    // The server refuses stop on a suspended machine ("start or delete it").
    expect(instaboxMachineActions('suspended')).toEqual(['resume'])
    expect(instaboxMachineActions('stopped')).toEqual(['start'])
    // The server refuses start from error ("stop or delete it").
    expect(instaboxMachineActions('error')).toEqual(['stop'])
    expect(instaboxMachineActions('creating')).toEqual([])
  })
})

describe('instaboxOrcaTemplates', () => {
  it('keeps one entry per Orca-capable template id', () => {
    const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }
    const herdr = { id: 'herdr', version: '1', defaultSpec: spec, capabilities: [] }
    const orca1 = { id: 'orca', version: '1', defaultSpec: spec, capabilities: ['orca'] }
    const orca2 = { ...orca1, version: '2' }
    // instabox lists herdr first; a phone create must still land on the Orca template.
    expect(instaboxOrcaTemplates([herdr, orca1, orca2]).map((t) => [t.id, t.version])).toEqual([
      ['orca', '2']
    ])
  })

  it('puts the orca template first so it is the default', () => {
    const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }
    const universal = { id: 'universal', version: '1', defaultSpec: spec, capabilities: ['orca'] }
    const orca = { id: 'orca', version: '1', defaultSpec: spec, capabilities: ['orca'] }
    expect(instaboxOrcaTemplates([universal, orca]).map((t) => t.id)).toEqual(['orca', 'universal'])
  })

  it('never offers a hidden template version', () => {
    const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }
    const current = { id: 'orca', version: '1', defaultSpec: spec, capabilities: ['orca'] }
    const retired = { ...current, version: '0', hidden: true }
    expect(instaboxOrcaTemplates([current, retired]).map((t) => t.version)).toEqual(['1'])
  })
})

describe('instaboxOrcaSnapshots', () => {
  it('keeps snapshots saved from an Orca-capable template version', () => {
    const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }
    const templates = [
      { id: 'orca', version: '2', defaultSpec: spec, capabilities: ['orca'] },
      { id: 'herdr', version: '1', defaultSpec: spec, capabilities: [] }
    ]
    const snapshot = (name: string, id: string, version: string) => ({
      id: `im_${name}`,
      name,
      template: { id, version },
      createdAt: ''
    })
    const snapshots = [
      snapshot('a', 'orca', '2'),
      snapshot('b', 'herdr', '1'),
      snapshot('c', 'orca', '9')
    ]
    expect(instaboxOrcaSnapshots(snapshots, templates).map((i) => i.name)).toEqual(['a'])
  })
})

describe('isValidInstaboxName', () => {
  it('follows instabox machine and snapshot names', () => {
    expect(isValidInstaboxName('orca-base-1')).toBe(true)
    expect(isValidInstaboxName('-x')).toBe(false)
    expect(isValidInstaboxName('Orca')).toBe(false)
    expect(isValidInstaboxName('a'.repeat(64))).toBe(false)
  })
})
