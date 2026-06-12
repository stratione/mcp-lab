import { z } from 'zod'
import {
  ChatResponseSchema,
  McpStatusResponseSchema,
  ProbeResultSchema,
  ProvidersResponseSchema,
  ToolsResponseSchema,
  HallucinationStateSchema,
  RegistryCatalogResponseSchema,
  type ChatResponse,
  type ChatMessage,
  type ToolDef,
  type McpServer,
} from './schemas'

export class ApiError extends Error {
  status: number | undefined
  detail: unknown
  constructor(message: string, status?: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

// ZodTypeAny was removed in zod 4; use z.ZodType<unknown> as the base constraint.
type AnySchema = z.ZodType<unknown>

async function call<T extends AnySchema>(
  url: string,
  schema: T,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Network error', undefined, e)
  }
  if (!res.ok) {
    let detail: unknown
    try {
      detail = await res.json()
    } catch {
      /* ignore */
    }
    throw new ApiError(`HTTP ${res.status}`, res.status, detail)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    throw new ApiError('Invalid JSON', res.status, e)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('Backend response shape changed', res.status, parsed.error.format())
  }
  return parsed.data
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const sendChat = (req: { message: string; history: ChatMessage[] }, signal?: AbortSignal) =>
  call('/api/chat', ChatResponseSchema, json(req), signal)

// /api/mcp-status returns an envelope; we extract the servers array for simple consumers.
export const getMcpStatus = async (signal?: AbortSignal): Promise<McpServer[]> => {
  const env = await call('/api/mcp-status', McpStatusResponseSchema, undefined, signal)
  return env.servers
}

export const getMcpStatusEnvelope = (signal?: AbortSignal) =>
  call('/api/mcp-status', McpStatusResponseSchema, undefined, signal)

export const getTools = (signal?: AbortSignal) =>
  call('/api/tools', ToolsResponseSchema, undefined, signal)

export const getRegistriesCatalog = (signal?: AbortSignal) =>
  call('/api/registries/catalog', RegistryCatalogResponseSchema, undefined, signal)

// Wipe a registry's data volume + restart its container. Destructive —
// every image/tag in the named registry is removed. Backed by /api/registries/{name}/clear.
export const clearRegistry = (name: 'dev' | 'prod') =>
  call(
    `/api/registries/${name}/clear`,
    z.object({ ok: z.boolean(), registry: z.string(), volume: z.string() }),
    { method: 'POST' },
  )

export const getProviders = (signal?: AbortSignal) =>
  call('/api/providers', ProvidersResponseSchema, undefined, signal)

export const setProvider = (cfg: {
  provider: string
  api_key?: string
  model?: string
  base_url?: string
}) => call('/api/provider', z.unknown(), json(cfg))

// ── Provider key health check ──
// Cheap auth-only ping — calls /v1/models on the provider, which doesn't
// consume tokens. Useful for the chip's "Test connection" button. The api_key
// in the body, if supplied, is used for THIS call only and never persisted.
export type ProviderKeyTestResult = {
  ok: boolean
  status: number
  message: string
  latency_ms: number
}
const ProviderKeyTestResultSchema = z.object({
  ok: z.boolean(),
  status: z.number(),
  message: z.string(),
  latency_ms: z.number(),
})
export const testProviderKey = (cfg: {
  provider: string
  api_key?: string
  base_url?: string
}): Promise<ProviderKeyTestResult> =>
  call('/api/test-provider-key', ProviderKeyTestResultSchema, json(cfg))

export type ModelEntry = {
  id: string
  label: string
  supports_tools: boolean
  installed: boolean | null
  recommended?: boolean
}
export type ModelCatalog = {
  provider: string
  default: string
  auto_resolves_to: string
  models: ModelEntry[]
}
const ModelCatalogSchema = z.object({
  provider: z.string(),
  default: z.string(),
  auto_resolves_to: z.string(),
  models: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      supports_tools: z.boolean(),
      installed: z.boolean().nullable(),
      // Optional so older bundles that haven't picked up the catalog change
      // still validate against the response. Defaults to false.
      recommended: z.boolean().optional().default(false),
    }),
  ),
})
export const getModels = (provider: string, signal?: AbortSignal): Promise<ModelCatalog> =>
  call(`/api/models?provider=${encodeURIComponent(provider)}`, ModelCatalogSchema, undefined, signal)

export type OllamaInstalledModel = { name: string; size?: number; modified_at?: string }
const OllamaInstalledSchema = z.object({
  models: z.array(z.object({ name: z.string(), size: z.number().optional(), modified_at: z.string().optional() })).default([]),
})
export const getOllamaInstalled = (signal?: AbortSignal) =>
  call('/api/ollama/installed', OllamaInstalledSchema, undefined, signal)

export const deleteOllamaModel = (name: string) =>
  call(`/api/ollama/models/${encodeURIComponent(name)}`, z.unknown(), { method: 'DELETE' })

export const getHallucinationMode = (signal?: AbortSignal) =>
  call('/api/hallucination-mode', HallucinationStateSchema, undefined, signal)

export const setHallucinationMode = (enabled: boolean) =>
  call('/api/hallucination-mode', HallucinationStateSchema, json({ enabled }))

export const probeUrl = (url: string) =>
  call('/api/probe', ProbeResultSchema, json({ url }))

export const mcpControl = (service: string, action: 'start' | 'stop') =>
  call('/api/mcp-control', z.unknown(), json({ service, action }))

// ── Pipeline Board (contract §4: GET /api/pipeline/state, GET /api/events) ──
// Every section of the pipeline state degrades to {"status": "offline"}
// independently, so each one is a discriminated union on `status`. Schemas
// are deliberately forgiving (defaults + per-section .catch fallbacks): a
// half-implemented or older backend renders as "offline" sections instead of
// blowing up the whole board with a shape error.

const OfflineSectionSchema = z.object({
  status: z.literal('offline'),
  hint: z.string().optional(),
  error: z.string().optional(),
})
export type OfflineSection = z.infer<typeof OfflineSectionSchema>
const OFFLINE: OfflineSection = { status: 'offline' }

const CommitOkSchema = z.object({
  status: z.literal('ok'),
  repo: z.string().default('mcpadmin/sample-app'),
  sha: z.string().default(''),
  message: z.string().default(''),
  author: z.string().default(''),
  when: z.string().default(''),
})

export const CiRunSchema = z.object({
  id: z.union([z.number(), z.string()]).catch(0),
  title: z.string().default(''),
  // Contract enumerates success|failure|running|waiting but Gitea can grow
  // statuses (cancelled, skipped, …) — keep it an open string.
  status: z.string().default('waiting'),
  event: z.string().default(''),
  head_sha: z.string().default(''),
  created: z.string().default(''),
})
export type CiRun = z.infer<typeof CiRunSchema>
const CiOkSchema = z.object({
  status: z.literal('ok'),
  runs: z.array(CiRunSchema).default([]),
})

export const PipelineRegistryImageSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()).default([]),
})
export type PipelineRegistryImage = z.infer<typeof PipelineRegistryImageSchema>
const RegistryOkSchema = z.object({
  status: z.literal('ok'),
  images: z.array(PipelineRegistryImageSchema).default([]),
})
// `.catch` degrades malformed sections; `.default` covers sections that are
// missing entirely (zod 4 keys are only optional when the schema accepts
// undefined — a bare .catch does not).
const RegistrySectionSchema = z
  .discriminatedUnion('status', [RegistryOkSchema, OfflineSectionSchema])
  .catch(OFFLINE)
  .default(OFFLINE)
export type RegistrySection = z.infer<typeof RegistrySectionSchema>

export const ScanItemSchema = z.object({
  id: z.union([z.number(), z.string()]).catch(0),
  image_name: z.string().default(''),
  tag: z.string().default(''),
  registry: z.string().default(''),
  scanned_by: z.string().default(''),
  critical: z.number().default(0),
  high: z.number().default(0),
  medium: z.number().default(0),
  low: z.number().default(0),
  total: z.number().default(0),
  passed: z.boolean().default(false),
  created_at: z.string().default(''),
})
export type ScanItem = z.infer<typeof ScanItemSchema>

export const PromotionItemSchema = z.object({
  id: z.union([z.number(), z.string()]).catch(0),
  image_name: z.string().default(''),
  tag: z.string().default(''),
  from_registry: z.string().nullable().optional(),
  to_registry: z.string().nullable().optional(),
  promoted_by: z.string().nullable().optional(),
  status: z.string().default(''),
  digest: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  created_at: z.string().default(''),
  // "promote" | "rollback" (open string for forward compat)
  action: z.string().default('promote'),
})
export type PromotionItem = z.infer<typeof PromotionItemSchema>

export const DeploymentItemSchema = z.object({
  name: z.string().default(''),
  image: z.string().default(''),
  env: z.string().default(''),
  port: z.number().nullable().optional(),
  state: z.string().default(''),
})
export type DeploymentItem = z.infer<typeof DeploymentItemSchema>

export const PipelineEventSchema = z.object({
  id: z.union([z.number(), z.string()]).catch(0),
  // gitea|runner|scan|promotion|deploy|manual (open string per contract)
  source: z.string().default('manual'),
  type: z.string().default(''),
  summary: z.string().default(''),
  detail: z.unknown().optional(),
  received_at: z.string().default(''),
})
export type PipelineEvent = z.infer<typeof PipelineEventSchema>

const itemsSection = <T extends z.ZodType>(item: T) =>
  z
    .discriminatedUnion('status', [
      z.object({ status: z.literal('ok'), items: z.array(item).default([]) }),
      OfflineSectionSchema,
    ])
    .catch(OFFLINE)
    .default(OFFLINE)

const ALL_REGISTRIES_OFFLINE = { dev: OFFLINE, staging: OFFLINE, prod: OFFLINE }

export const PipelineStateSchema = z.object({
  generated_at: z.string().default(''),
  commit: z
    .discriminatedUnion('status', [CommitOkSchema, OfflineSectionSchema])
    .catch(OFFLINE)
    .default(OFFLINE),
  ci: z
    .discriminatedUnion('status', [CiOkSchema, OfflineSectionSchema])
    .catch(OFFLINE)
    .default(OFFLINE),
  registries: z
    .object({
      dev: RegistrySectionSchema,
      staging: RegistrySectionSchema,
      prod: RegistrySectionSchema,
    })
    .catch(ALL_REGISTRIES_OFFLINE)
    .default(ALL_REGISTRIES_OFFLINE),
  scans: itemsSection(ScanItemSchema),
  promotions: itemsSection(PromotionItemSchema),
  deployments: itemsSection(DeploymentItemSchema),
  events: itemsSection(PipelineEventSchema),
})
export type PipelineState = z.infer<typeof PipelineStateSchema>
export type CommitSection = PipelineState['commit']
export type CiSection = PipelineState['ci']

export const getPipelineState = (signal?: AbortSignal): Promise<PipelineState> =>
  call('/api/pipeline/state', PipelineStateSchema, undefined, signal)

// GET /api/events?limit=N — newest first. The contract pins the record shape
// but not the envelope, so accept either a bare array or {items|events: [...]}.
const EventsResponseSchema = z.union([
  z.array(PipelineEventSchema),
  z.object({ items: z.array(PipelineEventSchema) }),
  z.object({ events: z.array(PipelineEventSchema) }),
])
export const getEvents = async (limit = 50, signal?: AbortSignal): Promise<PipelineEvent[]> => {
  const res = await call(`/api/events?limit=${limit}`, EventsResponseSchema, undefined, signal)
  if (Array.isArray(res)) return res
  if ('items' in res) return res.items
  return res.events
}

export const sendChatCompare = (body: unknown) =>
  call('/api/chat-compare', z.unknown(), json(body))

export const getChatHistory = () => call('/api/chat-history', z.unknown())

export const appendChatHistory = (msg: ChatMessage) =>
  call('/api/chat-history', z.unknown(), json(msg))

export const clearChatHistory = () =>
  call('/api/chat-history', z.unknown(), { method: 'DELETE' })

export type { ChatResponse, ToolDef, McpServer }
