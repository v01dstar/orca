import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HangarDeviceCode } from './hangar-device-code'

const mocks = vi.hoisted(() => ({ copied: [] as string[], opened: [] as string[] }))
vi.mock('expo-clipboard', () => ({
  setStringAsync: async (value: string) => {
    mocks.copied.push(value)
    return true
  }
}))
vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    Linking: { openURL: async (url: string) => void mocks.opened.push(url) },
    Pressable: ({ children, style, ...props }: { children?: unknown; style?: unknown }) =>
      React.createElement(
        'Pressable',
        { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
        children
      ),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: 'Text',
    View: 'View'
  }
})

describe('HangarDeviceCode', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('copies the code on tap, and before opening GitHub', async () => {
    const start = {
      deviceCode: 'hgd_x',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      interval: 5,
      expiresIn: 900
    }
    act(() => {
      renderer = create(createElement(HangarDeviceCode, { start, onCancel: () => {} }))
    })
    const press = (label: string) =>
      renderer!.root.find((n) => n.type === 'Pressable' && n.props.accessibilityLabel === label)

    await act(async () => press('Copy code ABCD-1234').props.onPress())
    expect(mocks.copied).toEqual(['ABCD-1234'])
    expect(JSON.stringify(renderer!.toJSON())).toContain('Copied')

    await act(async () => press('Copy code and open GitHub').props.onPress())
    expect(mocks.copied).toEqual(['ABCD-1234', 'ABCD-1234'])
    expect(mocks.opened).toEqual(['https://github.com/login/device'])
  })
})
