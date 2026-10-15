import type {
  OrcadMigrationCatalogAbortResult,
  OrcadMigrationCatalogState,
  OrcadMigrationManifest
} from '../../shared/orcad-migration-manifest'
import type { OrcadMigrationBlobDescriptor } from '../../shared/orcad-migration-blob-transfer'
import type { Store } from '../persistence'

type OrcadMigrationCatalogFlushStore = Partial<Pick<Store, 'flushPendingOrThrowAsync'>>
type OrcadMigrationCatalogStageStore = OrcadMigrationCatalogFlushStore &
  Partial<Pick<Store, 'stageOrcadMigrationCatalog'>>
type OrcadMigrationCatalogCommitStore = OrcadMigrationCatalogFlushStore &
  Partial<Pick<Store, 'commitStagedOrcadMigrationCatalog' | 'installOrcadMigrationReceivedBlobs'>>
type OrcadMigrationCatalogAbortStore = OrcadMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedOrcadMigrationCatalog'>>

export async function stageOrcadMigrationCatalogDurably(args: {
  store: OrcadMigrationCatalogStageStore
  manifest: OrcadMigrationManifest
  signal?: AbortSignal
}): Promise<OrcadMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.stageOrcadMigrationCatalog!(args.manifest)
  await flushMigrationState(args.store, args.signal)
  return result
}

export async function commitStagedOrcadMigrationCatalogDurably(args: {
  store: OrcadMigrationCatalogCommitStore
  manifest: OrcadMigrationManifest
  signal?: AbortSignal
  expectedBlobs?: readonly OrcadMigrationBlobDescriptor[]
  onDurableCommit: () => void
}): Promise<OrcadMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.commitStagedOrcadMigrationCatalog!(
    args.manifest,
    args.expectedBlobs ? { expectedBlobs: args.expectedBlobs } : {}
  )
  await flushMigrationState(args.store, args.signal)
  args.onDurableCommit()
  installReceivedBlobs(args.store, args.manifest)
  return result
}

/** After the durable commit, on its retries and state queries; the store load retries too. */
function installReceivedBlobs(
  store: Partial<Pick<Store, 'installOrcadMigrationReceivedBlobs'>>,
  manifest: OrcadMigrationManifest
): void {
  try {
    store.installOrcadMigrationReceivedBlobs?.(manifest)
  } catch (error) {
    // The catalog is committed; a failed install keeps its blob for the next retry.
    console.error('[orcad-migration] installing received blobs failed:', error)
  }
}

export async function abortStagedOrcadMigrationCatalogDurably(args: {
  store: OrcadMigrationCatalogAbortStore
  manifest: OrcadMigrationManifest
  signal?: AbortSignal
}): Promise<OrcadMigrationCatalogAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedOrcadMigrationCatalog!(args.manifest)
  // An already-absent retry may follow an in-memory abort whose flush failed.
  if (result.state === 'absent') {
    await flushMigrationState(args.store, args.signal)
    return { ...result, durableAbsent: true }
  }
  return result
}

export function getOrcadMigrationCatalogState(args: {
  store: Partial<
    Pick<Store, 'getOrcadMigrationCatalogState' | 'installOrcadMigrationReceivedBlobs'>
  >
  manifest: OrcadMigrationManifest
}): OrcadMigrationCatalogState {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.getOrcadMigrationCatalogState!(args.manifest)
  if (result.state === 'committed') {
    installReceivedBlobs(args.store, args.manifest)
  }
  return result
}

function flushMigrationState(
  store: OrcadMigrationCatalogFlushStore,
  signal?: AbortSignal
): Promise<void> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  return store.flushPendingOrThrowAsync!({
    signal,
    drainToStableGeneration: false
  })
}
