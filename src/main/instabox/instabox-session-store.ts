// Persists the desktop's own instabox session (not the instabox CLI's credentials file: two
// processes refreshing one rotating refresh token would revoke each other's family).
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { z } from 'zod'
import { writeSecureJsonFile } from '../../shared/secure-file'
import { InstaboxTokensSchema } from '../../shared/instabox/instabox-api-types'
import type { InstaboxSessionPersistence } from '../../shared/instabox/instabox-ipc'

export const InstaboxSessionSchema = z.object({
  serverUrl: z.string().min(1),
  login: z.string(),
  tokens: InstaboxTokensSchema
})
export type InstaboxSession = z.infer<typeof InstaboxSessionSchema>

const PersistedSchema = z.object({ version: z.literal(1), ciphertext: z.string() })

let memoryOnly: InstaboxSession | null = null

function sessionPath(userDataPath: string): string {
  return join(userDataPath, 'instabox-session.json')
}

export function saveInstaboxSession(
  userDataPath: string,
  session: InstaboxSession
): InstaboxSessionPersistence {
  if (!safeStorage.isEncryptionAvailable()) {
    // Why: instabox refresh tokens never fall back to plaintext; sign in again after a restart.
    memoryOnly = session
    return 'memory-only'
  }
  const ciphertext = safeStorage.encryptString(JSON.stringify(session)).toString('base64')
  writeSecureJsonFile(sessionPath(userDataPath), { version: 1, ciphertext })
  memoryOnly = null
  return 'encrypted'
}

export function readInstaboxSession(userDataPath: string): InstaboxSession | null {
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
    return InstaboxSessionSchema.parse(JSON.parse(plaintext))
  } catch (error) {
    console.error('[instabox] Ignoring an unreadable instabox session:', error)
    return null
  }
}

export function clearInstaboxSession(userDataPath: string): void {
  memoryOnly = null
  rmSync(sessionPath(userDataPath), { force: true })
}
