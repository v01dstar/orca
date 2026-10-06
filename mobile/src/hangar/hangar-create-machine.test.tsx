import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HangarCreateMachine } from './hangar-create-machine'
import type { useHangarMachines } from './use-hangar-machines'

vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    Pressable: ({ children, style, ...props }: { children?: unknown; style?: unknown }) =>
      React.createElement(
        'Pressable',
        { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
        children
      ),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View'
  }
})

const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }

function fakeHangar(createMachine: (...args: unknown[]) => Promise<void>) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the component reads only templates, images, busy and create.
  return {
    templates: [{ id: 'orca', version: '1', defaultSpec: spec, capabilities: ['orca'] }],
    images: [
      {
        id: 'im_1',
        name: 'orca-base',
        template: { id: 'orca', version: '1' },
        official: false,
        owned: true,
        createdAt: ''
      }
    ],
    busy: {},
    create: createMachine
  } as unknown as ReturnType<typeof useHangarMachines>
}

describe('HangarCreateMachine', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('creates from the template by default and from an image once picked', async () => {
    const createMachine = vi.fn(async () => {})
    act(() => {
      renderer = create(createElement(HangarCreateMachine, { hangar: fakeHangar(createMachine) }))
    })
    const tree = renderer!
    const button = (label: string) =>
      tree.root.find((n) => n.type === 'Pressable' && n.props.accessibilityLabel === label)
    const typeName = (name: string) =>
      act(() => tree.root.find((n) => n.type === 'TextInput').props.onChangeText(name))

    expect(button('Create from the orca template').props.accessibilityState.selected).toBe(true)
    typeName('box-1')
    await act(async () => button('Create').props.onPress())
    expect(createMachine).toHaveBeenLastCalledWith('box-1', { templateId: 'orca' })

    act(() => button('Create from image orca-base').props.onPress())
    expect(button('Create from image orca-base').props.accessibilityState.selected).toBe(true)
    typeName('box-2')
    await act(async () => button('Create').props.onPress())
    expect(createMachine).toHaveBeenLastCalledWith('box-2', { imageId: 'im_1' })
  })
})
