// Wire types of the instabox API (github.com/InsForge/instabox, pkg/instaboxapi) that Orca uses.
// Parsed with zod's default strip: unknown fields and new enum values must not break Orca.
import { z } from 'zod'

// The API host; box.instacloud.com is the dashboard and only redirects /v1, which fetch refuses.
export const INSTABOX_DEFAULT_SERVER_URL = 'https://api.box.instacloud.com'

export const InstaboxErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
  operationId: z.string().nullable().optional()
})

export const InstaboxTokensSchema = z.object({
  accessToken: z.string().min(1),
  accessExpiresAt: z.string(),
  refreshToken: z.string().min(1),
  refreshExpiresAt: z.string()
})
export type InstaboxTokens = z.infer<typeof InstaboxTokensSchema>

// Device flow (mobile sign-in): the user opens verificationUri and enters userCode.
export const InstaboxDeviceStartSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.string().min(1),
  interval: z.number(),
  expiresIn: z.number()
})
export type InstaboxDeviceStart = z.infer<typeof InstaboxDeviceStartSchema>

export const InstaboxMeSchema = z.object({
  userId: z.number(),
  login: z.string(),
  name: z.string().optional(),
  avatarUrl: z.string().optional()
})
export type InstaboxMe = z.infer<typeof InstaboxMeSchema>

const MachineSpecSchema = z.object({
  vcpus: z.number(),
  memMiB: z.number(),
  persistentDiskGiB: z.number(),
  rootDiskGiB: z.number().optional()
})
export type InstaboxMachineSpec = z.infer<typeof MachineSpecSchema>

export const InstaboxTemplateSchema = z.object({
  id: z.string(),
  version: z.string(),
  description: z.string().optional(),
  runtime: z.record(z.string(), z.string()).optional(),
  defaultSpec: MachineSpecSchema,
  capabilities: z.array(z.string()).optional(),
  // Retired versions: still listed so existing machines and snapshots resolve, never offered.
  hidden: z.boolean().optional()
})
export type InstaboxTemplate = z.infer<typeof InstaboxTemplateSchema>

// States are open-ended on the wire (e.g. running, stopped, suspended, creating, error).
export const InstaboxMachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  desiredState: z.string(),
  state: z.string(),
  revision: z.number(),
  operationId: z.string().nullable().optional(),
  template: z.object({ id: z.string(), version: z.string() }),
  spec: MachineSpecSchema,
  runtime: z.object({ ready: z.boolean() }),
  lastError: InstaboxErrorSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type InstaboxMachine = z.infer<typeof InstaboxMachineSchema>

export const InstaboxOperationSchema = z.object({
  id: z.string(),
  machineId: z.string(),
  type: z.string(),
  state: z.string(),
  phase: z.string().optional(),
  error: InstaboxErrorSchema.nullable().optional()
})
export type InstaboxOperation = z.infer<typeof InstaboxOperationSchema>

export const InstaboxOrcaConnectionSchema = z.object({
  machineId: z.string(),
  endpoint: z.string().min(1),
  assertion: z.string().min(1),
  serverPublicKey: z.string().min(1),
  scope: z.string(),
  expiresAt: z.string()
})
export type InstaboxOrcaConnection = z.infer<typeof InstaboxOrcaConnectionSchema>

export const INSTABOX_ORCA_CAPABILITY = 'orca'
export type InstaboxMachineAction = 'start' | 'stop' | 'suspend' | 'resume'

// Only templates that run an Orca runtime can become Orca hosts; one entry per template id.
export function instaboxOrcaTemplates(templates: readonly InstaboxTemplate[]): InstaboxTemplate[] {
  return [
    ...new Map(
      templates
        .filter(
          (template) =>
            !template.hidden && (template.capabilities ?? []).includes(INSTABOX_ORCA_CAPABILITY)
        )
        .map((template) => [template.id, template])
    ).values()
  ]
}

// Mirrors instabox-server's lifecycle transitions (internal/server/machines.go); anything else is a 409.
export function instaboxMachineActions(state: string): InstaboxMachineAction[] {
  switch (state) {
    case 'running':
      return ['suspend', 'stop']
    case 'suspended':
      return ['resume']
    case 'stopped':
      return ['start']
    case 'error':
      return ['stop']
    default:
      return []
  }
}

// A saved copy of a stopped machine's disks (no RAM); new machines can be created from it.
export const InstaboxSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: z.object({ id: z.string(), version: z.string() }),
  createdAt: z.string()
})
export type InstaboxSnapshot = z.infer<typeof InstaboxSnapshotSchema>

// A snapshot runs an Orca runtime when the template version it was saved from does.
export function instaboxOrcaSnapshots(
  snapshots: readonly InstaboxSnapshot[],
  templates: readonly InstaboxTemplate[]
): InstaboxSnapshot[] {
  return snapshots.filter((snapshot) =>
    templates.some(
      (t) =>
        t.id === snapshot.template.id &&
        t.version === snapshot.template.version &&
        (t.capabilities ?? []).includes(INSTABOX_ORCA_CAPABILITY)
    )
  )
}

// instabox's rule for machine and snapshot names (internal/server/machines.go nameRE).
export function isValidInstaboxName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(name)
}

// Exactly one of templateId and snapshotId.
export type InstaboxCreateMachineRequest = {
  name: string
  vcpus?: number
  memMiB?: number
  persistentDiskGiB?: number
} & ({ templateId: string; snapshotId?: never } | { snapshotId: string; templateId?: never })
