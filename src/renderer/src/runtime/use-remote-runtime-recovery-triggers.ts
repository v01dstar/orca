import { useEffect } from 'react'
import { retryAllRemoteRuntimePtyRecoveriesNow } from '@/components/terminal-pane/remote-runtime-pty-recovery-state'
import { useAppStore } from '@/store'

export function useRemoteRuntimeRecoveryTriggers(): void {
  useEffect(() => {
    const advanceRemoteRuntimeRecoveryBackoffs = (): void => {
      // Why: shared control and pane recovery own independent backoff timers.
      void window.api?.runtimeEnvironments?.retryConnectionsNow?.().catch(() => undefined)
      retryAllRemoteRuntimePtyRecoveriesNow()
    }
    window.addEventListener('online', advanceRemoteRuntimeRecoveryBackoffs)
    const unsubscribeSystemResumed =
      typeof window.api?.ui?.onSystemResumed === 'function'
        ? window.api.ui.onSystemResumed(advanceRemoteRuntimeRecoveryBackoffs)
        : null
    // Why (fork): an instabox machine started, resumed or re-enrolled; refresh hosts and reconnect now.
    const unsubscribeInstabox =
      window.api && 'instabox' in window.api
        ? window.api.instabox.onEnvironmentsChanged(() => {
            void window.api.runtimeEnvironments
              .list()
              .then((environments) => useAppStore.getState().setRuntimeEnvironments(environments))
              .catch(() => undefined)
            advanceRemoteRuntimeRecoveryBackoffs()
          })
        : null
    return () => {
      window.removeEventListener('online', advanceRemoteRuntimeRecoveryBackoffs)
      unsubscribeSystemResumed?.()
      unsubscribeInstabox?.()
    }
  }, [])
}
