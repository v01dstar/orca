// Persists the desktop's own hangar session (not the hangar CLI's credentials file: two
// processes refreshing one rotating refresh token would revoke each other's family).
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { z } from 'zod'
import { writeSecureJsonFile } from '../../shared/secure-file'
import { HangarTokensSchema } from '../../shared/hangar/hangar-api-types'
import type { HangarSessionPersistence } from '../../shared/hangar/hangar-ipc'

export const HangarSessionSchema = z.object({
  serverUrl: z.string().min(1),
  login: z.string(),
  tokens: HangarTokensSchema
})
export type HangarSession = z.infer<typeof HangarSessionSchema>

const PersistedSchema = z.object({ version: z.literal(1), ciphertext: z.string() })

let memoryOnly: HangarSession | null = null

function sessionPath(userDataPath: string): string {
  return join(userDataPath, 'hangar-session.json')
}

export function saveHangarSession(
  userDataPath: string,
  session: HangarSession
): HangarSessionPersistence {
  if (!safeStorage.isEncryptionAvailable()) {
    // Why: hangar refresh tokens never fall back to plaintext; sign in again after a restart.
    memoryOnly = session
    return 'memory-only'
  }
  const ciphertext = safeStorage.encryptString(JSON.stringify(session)).toString('base64')
  writeSecureJsonFile(sessionPath(userDataPath), { version: 1, ciphertext })
  memoryOnly = null
  return 'encrypted'
}

export function readHangarSession(userDataPath: string): HangarSession | null {
  if (memoryOnly) {
    return memoryOnly
  }
  const path = sessionPath(userDataPath)
  if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) {
    return null
  }
  try {
    const persisted = PersistedSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    const plaintext = safeStorage.decryptString(Buffer.from(persisted.ciphertext, 'base64'))
    return HangarSessionSchema.parse(JSON.parse(plaintext))
  } catch (error) {
    console.error('[hangar] Ignoring an unreadable hangar session:', error)
    return null
  }
}

export function clearHangarSession(userDataPath: string): void {
  memoryOnly = null
  rmSync(sessionPath(userDataPath), { force: true })
}
