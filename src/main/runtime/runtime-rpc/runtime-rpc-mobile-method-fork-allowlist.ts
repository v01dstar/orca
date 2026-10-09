// Why: this fork lets phones on instabox machines create workspaces by cloning, which upstream keeps
// desktop-only. Kept apart from MOBILE_RPC_METHOD_ALLOWLIST so upstream rebases stay conflict-free.
export const FORK_MOBILE_RPC_METHOD_ALLOWLIST: ReadonlySet<string> = new Set(['repo.clone'])
