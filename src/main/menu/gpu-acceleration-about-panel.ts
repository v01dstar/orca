export type GpuAccelerationAboutPanelOptions = {
  appName: string
  appVersion: string
  platform: NodeJS.Platform
  gpuFallbackActive: boolean
  gpuFeatureStatus: Pick<Electron.GPUFeatureStatus, 'gpu_compositing'> | null
  credit?: string | null
}

export function describeGpuAcceleration(
  gpuFeatureStatus: Pick<Electron.GPUFeatureStatus, 'gpu_compositing'> | null,
  gpuFallbackActive: boolean
): string {
  if (gpuFallbackActive) {
    return 'Disabled (Safe Graphics Mode)'
  }

  const compositing = gpuFeatureStatus?.gpu_compositing.trim().toLowerCase()
  if (!compositing || compositing === 'undefined') {
    return 'Status unavailable'
  }
  if (compositing === 'enabled') {
    return 'Enabled'
  }
  if (compositing.includes('software')) {
    return 'Software rendering'
  }
  if (compositing.startsWith('disabled')) {
    return 'Disabled'
  }
  if (compositing.startsWith('unavailable')) {
    return 'Unavailable'
  }
  return `Unknown (${compositing})`
}

export function createGpuAccelerationAboutPanelOptions({
  appName,
  appVersion,
  platform,
  gpuFallbackActive,
  gpuFeatureStatus,
  credit
}: GpuAccelerationAboutPanelOptions): Electron.AboutPanelOptionsOptions {
  const gpuStatus = `GPU acceleration: ${describeGpuAcceleration(gpuFeatureStatus, gpuFallbackActive)}`
  const status = credit ? `${credit}\n${gpuStatus}` : gpuStatus
  return {
    applicationName: appName,
    applicationVersion: appVersion,
    ...(platform === 'linux' ? { copyright: status } : { credits: status })
  }
}
