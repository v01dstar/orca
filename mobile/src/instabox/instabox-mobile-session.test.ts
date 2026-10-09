import { describe, expect, it, vi } from 'vitest'

const keychain = vi.hoisted(() => new Map<string, string>())
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }))
vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n) }))
vi.mock('../transport/pairing-keychain', () => ({
  readPairingKeychainItem: async (key: string) => keychain.get(key) ?? null,
  writePairingKeychainItem: async (key: string, value: string) => void keychain.set(key, value),
  deletePairingKeychainItem: async (key: string) => void keychain.delete(key)
}))
const later = new Date(Date.now() + 3600_000).toISOString()
vi.mock('../../../src/shared/instabox/instabox-api-client', () => ({
  createInstaboxApiClient: () => ({
    startDeviceLogin: async () => ({ deviceCode: 'd', userCode: 'ABCD-1234' }),
    waitForDeviceLogin: async () => ({
      accessToken: 'at',
      accessExpiresAt: later,
      refreshToken: 'rt',
      refreshExpiresAt: later
    }),
    me: async () => ({ userId: 1, login: 'v01dstar' })
  })
}))

describe('instabox mobile session', () => {
  it('sees a sign-in that happens after the stored session was first read', async () => {
    const { loadInstaboxSession, signInToInstabox } = await import('./instabox-mobile-session')
    // The screen mounts signed out: storage is read once and is empty.
    expect(await loadInstaboxSession()).toBeNull()
    await signInToInstabox('https://152.236.1.51', () => {})
    expect((await loadInstaboxSession())?.login).toBe('v01dstar')
  })
})
