// Links hangar machines to Orca runtime environments (source 'hangar'). An environment's
// endpoint is the loopback tunnel proxy and its token the hangar session's device token, so the
// rest of Orca treats it like any paired server.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../shared/pairing'
import { writeSecureJsonFile } from '../../shared/secure-file'
import {
  addEnvironmentFromPairingCode,
  listEnvironments,
  removeEnvironment,
  updateEnvironmentFromPairingCode
} from '../../shared/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../shared/runtime-environments'
import type { HangarMachine } from '../../shared/hangar/hangar-api-types'
import type { HangarAccount } from './hangar-account'
import { bootstrapHangarDevice } from './hangar-device-bootstrap'
import type { HangarTunnelProxy } from './hangar-tunnel-proxy'

const LinkSchema = z.object({
  machineId: z.string().min(1),
  serverUrl: z.string().min(1),
  environmentId: z.string().min(1)
})
export type HangarEnvironmentLink = z.infer<typeof LinkSchema>
const LinksSchema = z.object({ version: z.literal(1), links: z.array(LinkSchema) })

export class HangarEnvironments {
  private readonly rebootstrapping = new Set<string>()

  constructor(
    private readonly userDataPath: string,
    private readonly account: HangarAccount,
    private readonly proxy: HangarTunnelProxy,
    private readonly onChanged: () => void
  ) {}

  links(): HangarEnvironmentLink[] {
    const path = join(this.userDataPath, 'hangar-environments.json')
    if (!existsSync(path)) {
      return []
    }
    try {
      const known = new Set(listEnvironments(this.userDataPath).map((env) => env.id))
      // Why: a link whose environment the user removed in Settings is gone too.
      return LinksSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).links.filter((link) =>
        known.has(link.environmentId)
      )
    } catch (error) {
      console.error('[hangar] Ignoring an unreadable hangar-environments.json:', error)
      return []
    }
  }

  private saveLinks(links: HangarEnvironmentLink[]): void {
    writeSecureJsonFile(join(this.userDataPath, 'hangar-environments.json'), {
      version: 1,
      links
    })
  }

  private environment(machineId: string): KnownRuntimeEnvironment | null {
    const link = this.links().find((entry) => entry.machineId === machineId)
    return link
      ? (listEnvironments(this.userDataPath).find((env) => env.id === link.environmentId) ?? null)
      : null
  }

  /** The proxy's resolver: a fresh ticket per socket, refusing it if the runtime's key changed. */
  async resolveTunnel(machineId: string): Promise<{ endpoint: string }> {
    const connection = await this.account.client().createOrcaConnection(machineId, 'runtime')
    const known = this.environment(machineId)?.endpoints[0]?.publicKeyB64
    if (known && known !== connection.serverPublicKey) {
      // Why: a new runtime identity (fork, reset) invalidates the stored token; re-enroll once.
      void this.connect(machineId).catch((error: unknown) =>
        console.error('[hangar] Re-enrolling after a runtime key change failed:', error)
      )
      throw new Error('hangar machine runtime changed; reconnecting')
    }
    return { endpoint: connection.endpoint }
  }

  /** Enrolls this hangar session on the machine's runtime and saves its environment. */
  async connect(
    machineOrId: HangarMachine | string,
    name?: string
  ): Promise<KnownRuntimeEnvironment> {
    const machineId = typeof machineOrId === 'string' ? machineOrId : machineOrId.id
    if (this.rebootstrapping.has(machineId)) {
      throw new Error('hangar machine enrollment already in progress')
    }
    this.rebootstrapping.add(machineId)
    try {
      const client = this.account.client()
      const credentials = await bootstrapHangarDevice(
        await client.createOrcaConnection(machineId, 'runtime')
      )
      const pairingCode = encodePairingOffer({
        v: PAIRING_OFFER_VERSION,
        endpoint: this.proxy.endpointFor(machineId),
        deviceToken: credentials.deviceToken,
        publicKeyB64: credentials.publicKeyB64,
        scope: 'runtime'
      })
      const existing = this.environment(machineId)
      const environment = existing
        ? updateEnvironmentFromPairingCode(this.userDataPath, existing.id, { pairingCode })
        : addEnvironmentFromPairingCode(this.userDataPath, {
            name: this.uniqueName(
              name ?? (typeof machineOrId === 'string' ? machineId : machineOrId.name)
            ),
            pairingCode,
            source: 'hangar'
          })
      if (!existing) {
        this.saveLinks([
          ...this.links(),
          { machineId, serverUrl: client.baseUrl, environmentId: environment.id }
        ])
      }
      this.onChanged()
      return environment
    } finally {
      this.rebootstrapping.delete(machineId)
    }
  }

  /** Points every linked environment at this process's proxy port (it changes per launch). */
  refreshEndpoints(): void {
    let changed = false
    for (const link of this.links()) {
      const env = listEnvironments(this.userDataPath).find((e) => e.id === link.environmentId)
      const endpoint = env?.endpoints[0]
      const wanted = this.proxy.endpointFor(link.machineId)
      if (env && endpoint && endpoint.endpoint !== wanted) {
        updateEnvironmentFromPairingCode(this.userDataPath, env.id, {
          pairingCode: encodePairingOffer({
            v: PAIRING_OFFER_VERSION,
            endpoint: wanted,
            deviceToken: endpoint.deviceToken,
            publicKeyB64: endpoint.publicKeyB64,
            scope: 'runtime'
          })
        })
        changed = true
      }
    }
    if (changed) {
      this.onChanged()
    }
  }

  /** Forgets a machine's environment, e.g. after the machine was deleted. */
  forget(machineId: string): void {
    const links = this.links()
    const link = links.find((entry) => entry.machineId === machineId)
    if (!link) {
      return
    }
    removeEnvironment(this.userDataPath, link.environmentId)
    this.saveLinks(links.filter((entry) => entry !== link))
    this.onChanged()
  }

  private uniqueName(base: string): string {
    const taken = new Set(listEnvironments(this.userDataPath).map((env) => env.name))
    let name = base
    for (let n = 2; taken.has(name); n += 1) {
      name = `${base} (${n})`
    }
    return name
  }
}
