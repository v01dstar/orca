import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstaboxMachineRow } from './instabox-machine-row'
import type { useInstaboxMachines } from './use-instabox-machines'

type AlertButton = { text: string; style?: string; onPress?: () => void }
const alerts = vi.hoisted(() => new Array<{ title: string; buttons: AlertButton[] }>())
vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    ActivityIndicator: 'ActivityIndicator',
    Alert: {
      alert: (title: string, _message: string, buttons: AlertButton[]) =>
        void alerts.push({ title, buttons })
    },
    Pressable: ({ children, style, ...props }: { children?: unknown; style?: unknown }) =>
      React.createElement(
        'Pressable',
        { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
        children
      ),
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View'
  }
})

const machine = {
  id: 'm_1',
  name: 'box',
  desiredState: 'running',
  state: 'running',
  revision: 1,
  template: { id: 'orca', version: '1' },
  spec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
  runtime: { ready: true },
  createdAt: '',
  updatedAt: ''
}

describe('InstaboxMachineRow', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('deletes only after the confirmation, forgetting its Orca host', () => {
    const deleteMachine = vi.fn(async () => {})
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the row calls only deleteMachine in this flow.
    const instabox = { deleteMachine } as unknown as ReturnType<typeof useInstaboxMachines>
    act(() => {
      renderer = create(
        createElement(InstaboxMachineRow, {
          row: { machine, orcaCapable: true, hostId: 'instabox-m_1' },
          busy: undefined,
          instabox,
          onOpen: () => {}
        })
      )
    })
    const del = renderer!.root.find(
      (n) => n.type === 'Pressable' && n.props.accessibilityLabel === 'Delete box'
    )
    act(() => del.props.onPress())
    expect(alerts.map((a) => a.title)).toEqual(['Delete box?'])
    expect(deleteMachine).not.toHaveBeenCalled()

    act(() => alerts[0]!.buttons.find((b) => b.style === 'destructive')!.onPress!())
    expect(deleteMachine).toHaveBeenCalledWith(machine, 'instabox-m_1')
  })
})
