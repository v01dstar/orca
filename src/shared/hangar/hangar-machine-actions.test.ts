import { describe, expect, it } from 'vitest'
import { hangarMachineActions } from './hangar-api-types'

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
