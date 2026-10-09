import { createServer, type Server } from 'node:http'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'

test.use({ seedTestRepo: false })

const now = new Date().toISOString()
const later = new Date(Date.now() + 3600_000).toISOString()
const machine = (id: string, name: string, state: string, template = 'orca') => ({
  id,
  name,
  desiredState: state,
  state,
  revision: 1,
  operationId: null,
  template: { id: template, version: '2026-10-05.1' },
  spec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
  runtime: { ready: state === 'running' },
  createdAt: now,
  updatedAt: now
})
const spec = { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }

const snapshot = {
  id: 'im_1',
  name: 'orca-base',
  template: { id: 'orca', version: '2026-10-05.1', digest: 'sha256:x' },
  createdAt: now
}

// A fake instabox: just enough of its API for sign-in, the machine list and saving a snapshot.
async function startFakeInstabox(): Promise<{ url: string; server: Server; saved: string[] }> {
  const saved: string[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const json = (body: unknown): void => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    }
    if (url.pathname === '/auth/cli/start') {
      const back = new URL(url.searchParams.get('redirect_uri') ?? '')
      back.searchParams.set('code', 'code-1')
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, { Location: back.toString() }).end()
    } else if (url.pathname === '/v1/auth/cli/token') {
      json({
        accessToken: 'at',
        accessExpiresAt: later,
        refreshToken: 'rt',
        refreshExpiresAt: later
      })
    } else if (url.pathname === '/v1/me') {
      json({ userId: 42, login: 'e2e-user' })
    } else if (url.pathname === '/v1/templates') {
      json({
        templates: [
          { id: 'orca', version: '2026-10-05.1', defaultSpec: spec, capabilities: ['orca'] },
          { id: 'herdr', version: '2026-10-05.1', defaultSpec: spec, capabilities: [] }
        ]
      })
    } else if (url.pathname === '/v1/snapshots') {
      json({ snapshots: [snapshot] })
    } else if (url.pathname === '/v1/machines/m_2/snapshots' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        saved.push(body)
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify(snapshot))
      })
    } else if (url.pathname === '/v1/machines') {
      json({
        machines: [
          machine('m_1', 'orca-dev', 'running'),
          machine('m_2', 'orca-idle', 'stopped'),
          machine('m_3', 'plain-herdr', 'suspended', 'herdr')
        ]
      })
    } else {
      res
        .writeHead(404, { 'Content-Type': 'application/json' })
        .end('{"error":{"code":"not_found","message":"not found"}}')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { url: `http://127.0.0.1:${port}`, server, saved }
}

async function openCloudVmSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store!.getState()
    state.openSettingsTarget({ pane: 'servers', repoId: null })
    state.openSettingsPage()
  })
  await expect(page.getByPlaceholder('Search settings')).toBeVisible()
  await page
    .getByRole('group', { name: 'Remote server workflow' })
    .getByRole('button', { name: /^Cloud VM/ })
    .click()
}

test('signs in to instabox and lists machines with their Orca actions', async ({
  electronApp,
  orcaPage
}) => {
  const instabox = await startFakeInstabox()
  try {
    // Why: sign-in opens the system browser; follow the redirect in-process instead.
    await electronApp.evaluate(({ shell }) => {
      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async (target: string) => {
          await fetch(target)
        }
      })
    })
    await openCloudVmSettings(orcaPage)
    const section = orcaPage.locator('[data-settings-section="instabox-machines"]')
    await expect(section.getByText('Instabox machines')).toBeVisible()
    const signIn = section.getByRole('button', { name: 'Sign in to Instabox' })
    // Empty means the default Instabox API host.
    await expect(signIn).toBeEnabled()
    await section.getByRole('textbox', { name: 'Instabox server URL' }).fill(instabox.url)
    await section.screenshot({ path: test.info().outputPath('instabox-signed-out.png') })
    await signIn.click()

    await expect(section.getByText(`e2e-user · ${instabox.url}`)).toBeVisible()
    await expect(section.getByText('orca-dev')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Connect' })).toBeVisible()
    await expect(section.getByRole('button', { name: 'Start' })).toBeVisible()
    await expect(section.getByText('Template without Orca', { exact: false })).toBeVisible()
    await expect(section.getByRole('button', { name: 'Resume' })).toBeVisible()
    await section.screenshot({ path: test.info().outputPath('instabox-signed-in.png') })

    // instabox refuses stop on a suspended machine, so its menu must not offer it.
    await section.getByRole('button', { name: 'More machine actions' }).nth(2).click()
    await expect(orcaPage.getByRole('menuitem', { name: 'Delete…' })).toBeVisible()
    await expect(orcaPage.getByRole('menuitem', { name: 'Stop' })).toHaveCount(0)
    await orcaPage.keyboard.press('Escape')
    await section.getByRole('button', { name: 'More machine actions' }).first().click()
    await expect(orcaPage.getByRole('menuitem', { name: 'Stop' })).toBeVisible()
    await expect(orcaPage.getByRole('menuitem', { name: 'Suspend' })).toBeVisible()
    await orcaPage.keyboard.press('Escape')

    // A stopped machine can be saved as a snapshot; the name defaults to `<machine>-snapshot`.
    await section.getByRole('button', { name: 'More machine actions' }).nth(1).click()
    await orcaPage.getByRole('menuitem', { name: 'Save as snapshot…' }).click()
    const snapshotName = orcaPage.getByRole('textbox', { name: 'Snapshot name' })
    await expect(snapshotName).toHaveValue('orca-idle-snapshot')
    await orcaPage.getByRole('button', { name: 'Save snapshot' }).click()
    await expect
      .poll(() => instabox.saved)
      .toEqual([JSON.stringify({ name: 'orca-idle-snapshot' })])

    await section.getByRole('button', { name: 'New machine' }).click()
    await expect(section.getByRole('button', { name: 'Create machine' })).toBeDisabled()
    await section.getByRole('textbox', { name: 'Machine name' }).fill('new-box')
    await expect(section.getByRole('button', { name: 'Create machine' })).toBeEnabled()
    // The source picker offers saved snapshots next to templates.
    await section.getByRole('combobox', { name: 'Template' }).click()
    await expect(orcaPage.getByRole('option', { name: 'orca-base' })).toBeVisible()
    await orcaPage.getByRole('option', { name: 'orca-base' }).click()
    await section.screenshot({ path: test.info().outputPath('instabox-create.png') })

    await section.getByRole('button', { name: 'Sign out' }).click()
    await expect(section.getByRole('button', { name: 'Sign in to Instabox' })).toBeVisible()
  } finally {
    instabox.server.close()
  }
})
