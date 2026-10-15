// Fork: an SSH session into an instabox machine, in a local floating terminal tab.
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../shared/constants'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { revealFloatingWorkspacePanel } from '@/lib/floating-workspace-panel-reveal'
import { useAppStore } from '@/store'

export async function openInstaboxSshTerminal(machineId: string, name: string): Promise<void> {
  const command = await window.api.instabox.sshCommand({ machineId })
  const store = useAppStore.getState()
  // Why floating: it is the local scratchpad, so ssh runs on this computer rather than on a
  // focused remote runtime.
  const tab = store.createTab(
    FLOATING_TERMINAL_WORKTREE_ID,
    store.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID],
    undefined,
    { quickCommandLabel: `ssh ${name}` }
  )
  store.queueTabStartupCommand(tab.id, { command })
  revealFloatingWorkspacePanel(useAppStore.getState())
  focusTerminalTabSurface(tab.id)
}
