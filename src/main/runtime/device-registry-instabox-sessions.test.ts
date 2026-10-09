import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceRegistry } from './device-registry'

describe('DeviceRegistry instabox session devices', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'instabox-orca-devices-'))
  })
  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reuses one persisted row per session and scope', () => {
    const registry = new DeviceRegistry(dir)
    const desktop = registry.getOrCreateInstaboxDevice('sid-1', 'runtime')
    expect(registry.getOrCreateInstaboxDevice('sid-1', 'runtime')).toEqual(desktop)
    expect(registry.getOrCreateInstaboxDevice('sid-1', 'mobile').deviceId).not.toBe(
      desktop.deviceId
    )

    const reloaded = new DeviceRegistry(dir)
    expect(reloaded.getOrCreateInstaboxDevice('sid-1', 'runtime')).toMatchObject({
      deviceId: desktop.deviceId,
      token: desktop.token,
      hangarSessionId: 'sid-1'
    })
    expect(reloaded.validateToken(desktop.token)?.deviceId).toBe(desktop.deviceId)
  })

  it('is never mistaken for an unscanned pairing token', () => {
    const registry = new DeviceRegistry(dir)
    const instabox = registry.getOrCreateInstaboxDevice('sid-1', 'runtime')
    expect(instabox.lastSeenAt).toBeGreaterThan(0)

    const pending = registry.getOrCreatePendingDevice('CLI', 'runtime')
    expect(pending.deviceId).not.toBe(instabox.deviceId)
    registry.rotatePendingDevice('CLI', 'runtime')
    expect(registry.getDevice(instabox.deviceId)).not.toBeNull()
  })

  it('drops session rows unseen for 30 days when a new session arrives', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const registry = new DeviceRegistry(dir)
    const stale = registry.getOrCreateInstaboxDevice('sid-old', 'runtime')
    const paired = registry.addDevice('Phone', 'mobile')

    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    registry.getOrCreateInstaboxDevice('sid-new', 'runtime')

    expect(registry.getDevice(stale.deviceId)).toBeNull()
    expect(registry.getDevice(paired.deviceId)).not.toBeNull()
  })
})
