import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const CONFIG_PATH = require.resolve('../electron-builder.config.cjs')

function loadConfig(flavor) {
  const previous = process.env.ORCA_FLAVOR
  delete require.cache[CONFIG_PATH]
  if (flavor) {
    process.env.ORCA_FLAVOR = flavor
  } else {
    delete process.env.ORCA_FLAVOR
  }
  try {
    return require(CONFIG_PATH)
  } finally {
    if (previous === undefined) {
      delete process.env.ORCA_FLAVOR
    } else {
      process.env.ORCA_FLAVOR = previous
    }
    delete require.cache[CONFIG_PATH]
  }
}

const launcherResources = (config) =>
  config.mac.extraResources.filter(
    (entry) => typeof entry === 'object' && entry.to?.startsWith('bin/')
  )

describe('fork instabox flavor (ORCA_FLAVOR=instabox)', () => {
  afterEach(() => {
    delete require.cache[CONFIG_PATH]
  })

  it('packages a separate app that never updates from the official feeds', () => {
    const config = loadConfig('instabox')
    expect(config.appId).toBe('com.v01dstar.instabox')
    expect(config.productName).toBe('Instabox')
    expect(config.protocols).toEqual([{ name: 'Instabox', schemes: ['instabox'] }])
    expect(config.publish).toBeNull()
    expect(config.extraMetadata).toMatchObject({ name: 'instabox' })
    expect(launcherResources(config)).toEqual([
      { from: 'resources/darwin/bin/instabox-orca', to: 'bin/instabox-orca' }
    ])
  })

  it('leaves the stock build unchanged', () => {
    const config = loadConfig(undefined)
    expect(config.appId).toBe('com.stablyai.orca')
    expect(config.productName).toBe('Orca')
    expect(config.protocols).toEqual([{ name: 'Orca', schemes: ['orca'] }])
    expect(config.publish).toMatchObject({ provider: 'github', owner: 'stablyai' })
    expect(config.extraMetadata?.name).toBeUndefined()
    expect(launcherResources(config)).toEqual([
      { from: 'resources/darwin/bin/orca', to: 'bin/orca' }
    ])
  })
})
