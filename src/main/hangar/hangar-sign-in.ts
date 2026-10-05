// hangar native-client sign-in (RFC 8252, hangar internal/server/cliauth.go): a loopback
// listener receives a one-time code, traded with the PKCE verifier at /v1/auth/cli/token.
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { shell } from 'electron'

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000
const SUCCESS_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Signed in</title>' +
  '<p style="font-family:system-ui;margin:3rem">Signed in to hangar. You can close this tab and return to Orca.</p>'

export type HangarAuthorizationCode = { code: string; codeVerifier: string; redirectUri: string }

const base64Url = (buffer: Buffer): string => buffer.toString('base64url')

function closeServer(server: Server): void {
  server.closeAllConnections?.()
  server.close()
}

export function beginHangarSignIn(serverUrl: string): Promise<HangarAuthorizationCode> {
  const codeVerifier = base64Url(randomBytes(32))
  const state = base64Url(randomBytes(32))
  return new Promise((resolve, reject) => {
    let settled = false
    let redirectUri = ''
    const finish = (error: Error | null, code?: string): void => {
      if (settled) {
        return
      }
      settled = true
      closeServer(server)
      if (error || !code) {
        reject(error ?? new Error('hangar_sign_in_failed'))
      } else {
        resolve({ code, codeVerifier, redirectUri })
      }
    }
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      // Why: stray loopback probes (wrong path or state) must not end the user's sign-in.
      if (url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
        response.writeHead(404).end('Not found')
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error || !code) {
        response.writeHead(400).end('hangar sign-in failed. Return to Orca and try again.')
        finish(new Error(error ? `hangar_sign_in_${error}` : 'hangar_sign_in_failed'))
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_PAGE)
      finish(null, code)
    })
    const timeout = setTimeout(
      () => finish(new Error('hangar_sign_in_timeout')),
      SIGN_IN_TIMEOUT_MS
    )
    server.once('close', () => clearTimeout(timeout))
    server.once('error', (error) => finish(error))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish(new Error('hangar_sign_in_loopback_unavailable'))
        return
      }
      redirectUri = `http://127.0.0.1:${address.port}/callback`
      const start = new URL('/auth/cli/start', serverUrl)
      start.searchParams.set('redirect_uri', redirectUri)
      start.searchParams.set('state', state)
      start.searchParams.set(
        'code_challenge',
        base64Url(createHash('sha256').update(codeVerifier).digest())
      )
      start.searchParams.set('code_challenge_method', 'S256')
      void shell.openExternal(start.toString()).catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error('hangar_sign_in_browser_failed'))
      })
    })
  })
}
