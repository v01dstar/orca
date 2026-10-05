// Wire types of the hangar API (github.com/InsForge/hangar, pkg/hangarapi) that Orca uses.
// Parsed with zod's default strip: unknown fields and new enum values must not break Orca.
import { z } from 'zod'

export const HangarErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
  operationId: z.string().nullable().optional()
})

export const HangarTokensSchema = z.object({
  accessToken: z.string().min(1),
  accessExpiresAt: z.string(),
  refreshToken: z.string().min(1),
  refreshExpiresAt: z.string()
})
export type HangarTokens = z.infer<typeof HangarTokensSchema>

export const HangarMeSchema = z.object({
  userId: z.number(),
  login: z.string(),
  name: z.string().optional(),
  avatarUrl: z.string().optional()
})
export type HangarMe = z.infer<typeof HangarMeSchema>

const MachineSpecSchema = z.object({
  vcpus: z.number(),
  memMiB: z.number(),
  persistentDiskGiB: z.number(),
  rootDiskGiB: z.number().optional()
})
export type HangarMachineSpec = z.infer<typeof MachineSpecSchema>

export const HangarTemplateSchema = z.object({
  id: z.string(),
  version: z.string(),
  description: z.string().optional(),
  runtime: z.record(z.string(), z.string()).optional(),
  defaultSpec: MachineSpecSchema,
  capabilities: z.array(z.string()).optional()
})
export type HangarTemplate = z.infer<typeof HangarTemplateSchema>

// States are open-ended on the wire (e.g. running, stopped, suspended, creating, error).
export const HangarMachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  desiredState: z.string(),
  state: z.string(),
  revision: z.number(),
  operationId: z.string().nullable().optional(),
  template: z.object({ id: z.string(), version: z.string() }),
  spec: MachineSpecSchema,
  runtime: z.object({ ready: z.boolean() }),
  lastError: HangarErrorSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type HangarMachine = z.infer<typeof HangarMachineSchema>

export const HangarOperationSchema = z.object({
  id: z.string(),
  machineId: z.string(),
  type: z.string(),
  state: z.string(),
  phase: z.string().optional(),
  error: HangarErrorSchema.nullable().optional()
})
export type HangarOperation = z.infer<typeof HangarOperationSchema>

export const HangarOrcaConnectionSchema = z.object({
  machineId: z.string(),
  endpoint: z.string().min(1),
  assertion: z.string().min(1),
  serverPublicKey: z.string().min(1),
  scope: z.string(),
  expiresAt: z.string()
})
export type HangarOrcaConnection = z.infer<typeof HangarOrcaConnectionSchema>

export const HANGAR_ORCA_CAPABILITY = 'orca'
export type HangarMachineAction = 'start' | 'stop' | 'suspend' | 'resume'

export type HangarCreateMachineRequest = {
  name: string
  templateId: string
  vcpus?: number
  memMiB?: number
  persistentDiskGiB?: number
}
