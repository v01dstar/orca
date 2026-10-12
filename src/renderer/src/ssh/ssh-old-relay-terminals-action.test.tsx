// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TerminalSshReconnectOverlay } from '@/components/terminal-pane/TerminalSshReconnectOverlay'
import {
  ConfirmationDialogContext,
  type ConfirmationDialogContextValue
} from '@/components/confirmation-dialog-context'
import { useAppStore } from '@/store'
import { resetSshConnectInFlightForTests } from './ssh-connect-in-flight'
import type { SshConnectionState, SshManagedServerStatus } from '../../../shared/ssh-types'
import type * as I18nModule from '@/i18n/i18n'

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  loading: vi.fn(() => 'toast-1'),
  success: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMocks }))

vi.mock('@/i18n/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => values?.[name] ?? '')
}))

const targetId = 'ssh-1'

function seed(managedServer: SshManagedServerStatus): void {
  const state: SshConnectionState = {
    targetId,
    status: 'error',
    error: 'refused',
    reconnectAttempt: 0,
    managedServer
  }
  useAppStore.setState({ sshConnectionStates: new Map([[targetId, state]]) })
}

function installApi(api: Record<string, ReturnType<typeof vi.fn>>): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        listTargets: vi.fn().mockResolvedValue([]),
        listRemovedTargetLabels: vi.fn().mockResolvedValue({}),
        ...api
      }
    }
  })
}

function renderOverlay(
  confirm: ConfirmationDialogContextValue,
  environmentId: string | null = null
) {
  return render(
    <ConfirmationDialogContext.Provider value={confirm}>
      <TerminalSshReconnectOverlay
        targetId={targetId}
        targetLabel="devbox"
        status="error"
        sshOwnerEnvironmentId={environmentId}
      />
    </ConfirmationDialogContext.Provider>
  )
}

const live: SshManagedServerStatus = {
  kind: 'relay',
  reason: 'relay_terminals_live',
  terminals: 2,
  oldRelays: { hostOs: 'posix', pids: [4101, 4102] }
}

describe('End old terminals on this host', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    resetSshConnectInFlightForTests()
    for (const mock of Object.values(toastMocks)) {
      mock.mockClear()
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('is offered when the census proves old relay terminals live, and ends them after confirmation', async () => {
    seed(live)
    const endOldRelayTerminals = vi.fn().mockResolvedValue({ ended: 2, connected: true })
    installApi({ connect: vi.fn(), endOldRelayTerminals })
    const confirm = vi.fn<ConfirmationDialogContextValue>().mockResolvedValue(true)
    const user = userEvent.setup()
    renderOverlay(confirm)

    await user.click(screen.getByRole('button', { name: 'End old terminals on this host' }))

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmVariant: 'destructive',
        description: expect.stringContaining(
          'The shells and agents running in them stop. Agents that support resume can be resumed afterwards; plain shells can’t be brought back.'
        )
      })
    )
    await waitFor(() => expect(endOldRelayTerminals).toHaveBeenCalledWith({ targetId }))
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        'Old terminals ended. The host is connected.',
        { id: 'toast-1' }
      )
    )
  })

  it('ends nothing when the confirmation is cancelled', async () => {
    seed(live)
    const endOldRelayTerminals = vi.fn()
    installApi({ connect: vi.fn(), endOldRelayTerminals })
    const user = userEvent.setup()
    renderOverlay(vi.fn<ConfirmationDialogContextValue>().mockResolvedValue(false))

    await user.click(screen.getByRole('button', { name: 'End old terminals on this host' }))
    expect(endOldRelayTerminals).not.toHaveBeenCalled()
  })

  it('is not offered when the census is unverifiable; the error names the command instead', () => {
    seed({
      kind: 'relay',
      reason: 'relay_terminals_unverifiable',
      oldRelays: { hostOs: 'posix', pids: [] }
    })
    installApi({ connect: vi.fn(), endOldRelayTerminals: vi.fn() })
    renderOverlay(vi.fn<ConfirmationDialogContextValue>())

    expect(screen.queryByRole('button', { name: 'End old terminals on this host' })).toBeNull()
  })

  it('is not offered for a host a remote Orca server owns', () => {
    seed(live)
    installApi({ connect: vi.fn(), endOldRelayTerminals: vi.fn() })
    renderOverlay(vi.fn<ConfirmationDialogContextValue>(), 'env-1')

    expect(screen.queryByRole('button', { name: 'End old terminals on this host' })).toBeNull()
  })

  it('puts the action on the failed-connect toast', async () => {
    seed(live)
    installApi({
      connect: vi.fn().mockRejectedValue(new Error('refused')),
      endOldRelayTerminals: vi.fn()
    })
    const user = userEvent.setup()
    renderOverlay(vi.fn<ConfirmationDialogContextValue>())

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        expect.stringContaining('(process IDs 4101, 4102), run: pkill -u'),
        expect.objectContaining({
          action: expect.objectContaining({ label: 'End old terminals on this host' })
        })
      )
    )
  })
})
