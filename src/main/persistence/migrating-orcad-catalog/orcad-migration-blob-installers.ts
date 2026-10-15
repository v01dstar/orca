/**
 * Per-kind handling of migration blobs on the destination: a content check before the catalog
 * commits, and an installer after the commit is durable that moves the received blob into live
 * state and deletes it. Kinds without an installer are not advertised, so none arrive.
 */
import { readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import type { OrcadMigrationBlobKind } from '../../../shared/orcad-migration-blob-transfer'
import type { OrcadMigrationManifest } from '../../../shared/orcad-migration-manifest'
import {
  ORCAD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
  parseOrcadMigrationTerminalRestoreHintsText,
  type OrcadMigrationTerminalRestoreHint
} from '../../../shared/orcad-migration-terminal-restore-hints'
import { syncDirectoryDurablySync } from '../../durable-file-write'
import {
  getOrcadMigrationReceivedBlobPath,
  stagedOrcadMigrationBlobFiles
} from './orcad-migration-blob-staging'
import {
  orcadMigrationStagingKey,
  type OrcadMigrationRequestIdentity
} from './orcad-migration-staged-file'
import type {
  OrcadTerminalRestoreHintPlacement,
  OrcadTerminalRestoreHintStore
} from './orcad-terminal-restore-hint-store'

type OrcadMigrationBlobContentCheck = (bytes: Buffer) => void

const UTF8 = new TextDecoder('utf-8', { fatal: true })

const BLOB_CONTENT_CHECKS: Partial<Record<OrcadMigrationBlobKind, OrcadMigrationBlobContentCheck>> =
  {
    'terminal-restore-hints': (bytes) => {
      parseOrcadMigrationTerminalRestoreHintsText(decodeUtf8(bytes))
    }
  }

/**
 * Bytes that matched their digest but not their format mean a buggy sender. Refusing here, before
 * anything lands, fails the move while the source still owns everything — nothing is lost.
 */
export function assertOrcadMigrationBlobContentsValid(
  manifest: OrcadMigrationManifest,
  root: string
): void {
  for (const { descriptor, path } of stagedOrcadMigrationBlobFiles(manifest, root)) {
    const check = BLOB_CONTENT_CHECKS[descriptor.blobKind]
    if (!check) {
      continue
    }
    try {
      check(readFileSync(path))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`orcad_migration_blob_content_invalid:${descriptor.blobKind}:${reason}`)
    }
  }
}

export type OrcadMigrationBlobInstall = {
  migration: OrcadMigrationRequestIdentity
  root: string
  terminalRestoreHints: OrcadTerminalRestoreHintStore
  /** The worktree that owns the pane on this host, or null when the pane is not here. */
  paneWorktreeId: (paneKey: string) => string | null
  now: number
}

/**
 * Idempotent: a blob already installed is only deleted, and the hint store remembers installed
 * migrations so a retry never revives a hint a pane already took. A write failure keeps the blob
 * for the next retry: a commit retry, a catalog-state query, or the next store load.
 */
export function installOrcadMigrationReceivedBlobs(install: OrcadMigrationBlobInstall): void {
  installTerminalRestoreHints(install)
}

function installTerminalRestoreHints(install: OrcadMigrationBlobInstall): void {
  const path = getOrcadMigrationReceivedBlobPath(install.root, install.migration, {
    blobKind: 'terminal-restore-hints',
    key: ORCAD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY
  })
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch {
    return
  }
  const migrationKey = orcadMigrationStagingKey(install.migration)
  if (!install.terminalRestoreHints.hasInstalledMigration(migrationKey)) {
    try {
      const document = parseOrcadMigrationTerminalRestoreHintsText(decodeUtf8(bytes))
      install.terminalRestoreHints.install(
        { migrationKey, migrationId: install.migration.migrationId },
        placeHints(document.hints, install.paneWorktreeId),
        install.now
      )
    } catch (error) {
      if (!isHintFormatError(error)) {
        throw error
      }
      // The pre-commit check passed these bytes, so only a damaged file lands here; the catalog
      // is already durable, and its panes reopen at their default folder.
      console.error(
        `[orcad-migration] dropped unreadable terminal restore hints for ${install.migration.migrationId}:`,
        error
      )
    }
  }
  rmSync(path, { force: true })
  syncDirectoryDurablySync(dirname(path))
}

// A hint whose pane is not in this host's session has no worktree to scope it to, so it is dropped.
function placeHints(
  hints: readonly OrcadMigrationTerminalRestoreHint[],
  paneWorktreeId: (paneKey: string) => string | null
): OrcadTerminalRestoreHintPlacement[] {
  return hints.flatMap((hint) => {
    const worktreeId = paneWorktreeId(hint.paneKey)
    return worktreeId ? [{ ...hint, worktreeId }] : []
  })
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return UTF8.decode(bytes)
  } catch {
    throw new Error('orcad_migration_terminal_restore_hints_not_utf8')
  }
}

function isHintFormatError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('orcad_migration_terminal_restore_')
}
