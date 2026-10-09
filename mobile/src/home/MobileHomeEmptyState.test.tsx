import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileHomeEmptyState } from './MobileHomeEmptyState'

vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    Pressable: ({ children, ...props }: { children?: unknown }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: 'Text',
    View: 'View'
  }
})

vi.mock('lucide-react-native', () => ({ Cloud: 'Cloud', QrCode: 'QrCode' }))

describe('MobileHomeEmptyState', () => {
  let renderer: ReactTestRenderer | null = null

  function render(onOpenInstabox?: () => void): ReactTestRenderer {
    act(() => {
      renderer = create(
        createElement(MobileHomeEmptyState, {
          bottomInset: 0,
          contentMaxWidth: 600,
          isWideLayout: false,
          onPairDesktop: () => {},
          onOpenInstabox
        })
      )
    })
    return renderer!
  }

  function buttonLabels(tree: ReactTestRenderer): string[] {
    return tree.root
      .findAll((node) => node.type === 'Pressable')
      .map((button) => button.findByType('Text').props.children)
  }

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('offers instabox machines only when the screen can open them', () => {
    expect(buttonLabels(render())).toEqual(['Pair Desktop'])
    act(() => renderer?.unmount())

    const onOpenInstabox = vi.fn()
    const tree = render(onOpenInstabox)
    expect(buttonLabels(tree)).toEqual(['Pair Desktop', 'Use Instabox machines'])
    act(() => {
      tree.root.findAll((node) => node.type === 'Pressable')[1]!.props.onPress()
    })
    expect(onOpenInstabox).toHaveBeenCalledOnce()
  })
})
