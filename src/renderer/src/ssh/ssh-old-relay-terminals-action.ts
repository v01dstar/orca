/** "End old terminals on this host": the confirmation, the call, and the connect-failure toast that offers it. */
import { useCallback, useContext } from 'react'
import { toast } from 'sonner'
import {
  ConfirmationDialogContext,
  type ConfirmationDialogContextValue
} from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { beginSshConnect, endSshConnect, isSshConnectInFlight } from './ssh-connect-in-flight'
import { canEndOldRelayTerminals, sshTargetConnectFailureText } from './ssh-host-server-status-copy'

export function endOldRelayTerminalsLabel(): string {
  return translate(
    'auto.components.settings.sshHostServer.endOldTerminals.action',
    'End old terminals on this host'
  )
}

export async function confirmAndEndOldRelayTerminals(
  targetId: string,
  confirm: ConfirmationDialogContextValue
): Promise<void> {
  const confirmed = await confirm({
    title: translate(
      'auto.components.settings.sshHostServer.endOldTerminals.title',
      'End old terminals on this host?'
    ),
    description: translate(
      'auto.components.settings.sshHostServer.endOldTerminals.description',
      'This ends every terminal an older version of Orca left running on this host for this account, including ones opened from other computers. The shells and agents running in them stop. Agents that support resume can be resumed afterwards; plain shells can’t be brought back.'
    ),
    confirmLabel: translate(
      'auto.components.settings.sshHostServer.endOldTerminals.confirm',
      'End terminals'
    ),
    confirmVariant: 'destructive'
  })
  // Why the connect lock: the action reconnects, so every Connect button on this host waits.
  if (!confirmed || isSshConnectInFlight(targetId)) {
    return
  }
  beginSshConnect(targetId)
  const toastId = toast.loading(
    translate(
      'auto.components.settings.sshHostServer.endOldTerminals.running',
      'Ending old terminals…'
    )
  )
  try {
    const end = window.api.ssh.endOldRelayTerminals
    if (!end) {
      throw new Error('Ending old terminals is unavailable here.')
    }
    const result = await end({ targetId })
    if (result.connected) {
      toast.success(
        translate(
          'auto.components.settings.sshHostServer.endOldTerminals.connected',
          'Old terminals ended. The host is connected.'
        ),
        { id: toastId }
      )
      return
    }
    toast.error(
      sshTargetConnectFailureText(
        targetId,
        new Error(result.error ?? ''),
        translate(
          'auto.components.settings.sshHostServer.endOldTerminals.failed',
          'Orca couldn’t end the old terminals.'
        )
      ),
      { id: toastId }
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error), { id: toastId })
  } finally {
    endSshConnect(targetId)
  }
}

/**
 * The connect-failure toast for a local SSH host. When the failure is old relay terminals Orca can
 * end, the toast carries the action; without a confirmation provider it stays plain.
 */
export function useSshConnectFailureToast(): (
  targetId: string,
  error: unknown,
  fallback: string,
  options?: { local?: boolean }
) => void {
  const confirm = useContext(ConfirmationDialogContext)
  return useCallback(
    (targetId, error, fallback, options) => {
      const text = sshTargetConnectFailureText(targetId, error, fallback)
      if (
        confirm === null ||
        options?.local === false ||
        window.api.ssh.endOldRelayTerminals === undefined ||
        !canEndOldRelayTerminals(useAppStore.getState().sshConnectionStates.get(targetId))
      ) {
        toast.error(text)
        return
      }
      toast.error(text, {
        duration: Infinity,
        action: {
          label: endOldRelayTerminalsLabel(),
          onClick: () => void confirmAndEndOldRelayTerminals(targetId, confirm)
        }
      })
    },
    [confirm]
  )
}

/** The action for a surface that shows the refusal; null when Orca can't end them itself. */
export function useEndOldRelayTerminalsAction(
  targetId: string,
  options?: { local?: boolean }
): (() => void) | null {
  const confirm = useContext(ConfirmationDialogContext)
  const endable = useAppStore((s) => canEndOldRelayTerminals(s.sshConnectionStates.get(targetId)))
  if (
    !confirm ||
    !endable ||
    options?.local === false ||
    window.api.ssh.endOldRelayTerminals === undefined
  ) {
    return null
  }
  return () => void confirmAndEndOldRelayTerminals(targetId, confirm)
}
