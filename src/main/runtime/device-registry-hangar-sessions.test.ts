import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceRegistry } from './device-registry'

describe('DeviceRegistry hangar session devices', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-hangar-devices-'))
  })
  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reuses one persisted row per session and scope', () => {
    const registry = new DeviceRegistry(dir)
    const desktop = registry.getOrCreateHangarDevice('sid-1', 'runtime')
    expect(registry.getOrCreateHangarDevice('sid-1', 'runtime')).toEqual(desktop)
    expect(registry.getOrCreateHangarDevice('sid-1', 'mobile').deviceId).not.toBe(desktop.deviceId)

    const reloaded = new DeviceRegistry(dir)
    expect(reloaded.getOrCreateHangarDevice('sid-1', 'runtime')).toMatchObject({
      deviceId: desktop.deviceId,
      token: desktop.token,
      hangarSessionId: 'sid-1'
    })
    expect(reloaded.validateToken(desktop.token)?.deviceId).toBe(desktop.deviceId)
  })

  it('is never mistaken for an unscanned pairing token', () => {
    const registry = new DeviceRegistry(dir)
    const hangar = registry.getOrCreateHangarDevice('sid-1', 'runtime')
    expect(hangar.lastSeenAt).toBeGreaterThan(0)

    const pending = registry.getOrCreatePendingDevice('CLI', 'runtime')
    expect(pending.deviceId).not.toBe(hangar.deviceId)
    registry.rotatePendingDevice('CLI', 'runtime')
    expect(registry.getDevice(hangar.deviceId)).not.toBeNull()
  })

  it('drops session rows unseen for 30 days when a new session arrives', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const registry = new DeviceRegistry(dir)
    const stale = registry.getOrCreateHangarDevice('sid-old', 'runtime')
    const paired = registry.addDevice('Phone', 'mobile')

    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    registry.getOrCreateHangarDevice('sid-new', 'runtime')

    expect(registry.getDevice(stale.deviceId)).toBeNull()
    expect(registry.getDevice(paired.deviceId)).not.toBeNull()
  })
})
