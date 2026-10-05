import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAppFlavor } from './app-flavor'

describe('getAppFlavor', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps every official name for stock builds', () => {
    vi.stubEnv('ORCA_APP_FLAVOR', '')
    expect(getAppFlavor()).toMatchObject({
      id: 'stock',
      appName: 'Orca',
      appId: 'com.stablyai.orca',
      userDataDirName: 'orca',
      homeStateDirName: '.orca',
      cliCommandName: 'orca',
      urlScheme: 'orca',
      autoUpdates: true
    })
  })

  it('names nothing the official app uses in the hangar flavor (the CLI learns it from its launcher)', () => {
    vi.stubEnv('ORCA_APP_FLAVOR', 'hangar')
    const flavor = getAppFlavor()
    expect(flavor).toMatchObject({ id: 'hangar', autoUpdates: false })
    const stock = { ...getStockForComparison() }
    for (const key of [
      'appName',
      'appId',
      'userDataDirName',
      'homeStateDirName',
      'cliCommandName',
      'urlScheme',
      'tmpPrefix'
    ] as const) {
      expect(flavor[key]).not.toBe(stock[key])
    }
  })
})

function getStockForComparison() {
  vi.stubEnv('ORCA_APP_FLAVOR', '')
  const stock = getAppFlavor()
  vi.stubEnv('ORCA_APP_FLAVOR', 'hangar')
  return stock
}
