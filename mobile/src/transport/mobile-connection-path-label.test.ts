import { describe, expect, it } from 'vitest'
import { mobileConnectionPathLabel } from './mobile-connection-path-label'

describe('mobile connection path label', () => {
  it('distinguishes LAN, Tailscale, and the relay without exposing transport errors', () => {
    expect(mobileConnectionPathLabel('lan')).toBe('Direct · LAN')
    expect(mobileConnectionPathLabel('tailscale')).toBe('Direct · Tailscale')
    expect(mobileConnectionPathLabel('relay')).toBe('Orca Relay')
  })

  it('names the instabox tunnel instead of the direct path the transport reports', () => {
    expect(mobileConnectionPathLabel('lan', 'instabox://152.236.1.51/m_1')).toBe('Via Instabox')
    expect(mobileConnectionPathLabel('lan', 'ws://10.0.0.2:6768')).toBe('Direct · LAN')
  })
})
