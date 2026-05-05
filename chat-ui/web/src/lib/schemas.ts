import { z } from 'zod'

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  result: z.string().nullable().optional(),
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const TokenUsageSchema = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  total_tokens: z.number().default(0),
})
export type TokenUsage = z.infer<typeof TokenUsageSchema>

export const ConfidenceSchema = z.object({
  score: z.number().default(0),
  label: z.string().default('Unknown'),
  source: z.string().default('heuristic'),
  details: z.string().default(''),
})

export const ChatResponseSchema = z.object({
  reply: z.string(),
  tool_calls: z.array(ToolCallSchema).default([]),
  token_usage: TokenUsageSchema.default({ input_tokens: 0, output_tokens: 0, total_tokens: 0 }),
  confidence: ConfidenceSchema.default({ score: 0, label: 'Unknown', source: 'heuristic', details: '' }),
  hallucination_mode: z.boolean().default(false),
  provider: z.string().default(''),
  model: z.string().default(''),
})
export type ChatResponse = z.infer<typeof ChatResponseSchema>

// McpServerSchema represents a single server entry.
// The backend check_servers() returns: name, url, port, status, tools (string[]), tool_count.
// latency_ms is not currently returned by the backend but is kept optional for future use.
export const McpServerSchema = z.object({
  name: z.string(),
  status: z.union([z.enum(['online', 'offline', 'degraded']), z.string()]),
  port: z.number().nullable().optional(),
  latency_ms: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
  tools: z.array(z.string()).optional(),
  tool_count: z.number().optional(),
})
export type McpServer = z.infer<typeof McpServerSchema>

// McpStatusSchema is a flat array of servers (used in component-level queries).
export const McpStatusSchema = z.array(McpServerSchema)

// McpStatusResponseSchema matches the actual /api/mcp-status response shape:
// { servers: [...], total_tools: number, online_count: number, engine: string,
//   prebuild_status: { "mcp-user": "ready" | "preparing", ... } }
//
// prebuild_status reflects whether the compose-built image for each MCP exists
// on disk yet. After tier-aware setup, off-tier MCPs are built in the background
// and their entries flip from "preparing" to "ready" once `docker image inspect`
// succeeds. UI uses this to label Start buttons during the post-setup window.
export const McpStatusResponseSchema = z.object({
  servers: z.array(McpServerSchema),
  total_tools: z.number().default(0),
  online_count: z.number().default(0),
  engine: z.string().default('docker'),
  host_project_dir: z.string().default(''),
  prebuild_status: z.record(z.string(), z.enum(['ready', 'preparing'])).default({}),
  error: z.string().optional(),
})
export type McpStatusResponse = z.infer<typeof McpStatusResponseSchema>

// ProvidersResponseSchema covers both the test shape { providers, current } and
// the actual backend shape { providers (array of objects), active (object) }.
// providers is kept as z.array(z.unknown()) to handle both string[] and object[].
export const ProvidersResponseSchema = z.object({
  providers: z.array(z.unknown()),
  current: z.string().nullable().optional(),
  active: z.unknown().optional(),
})

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  inputSchema: z.unknown().optional(),
  category: z.string().optional(),
})
export const ToolsResponseSchema = z.object({
  tools: z.array(ToolSchema),
  error: z.string().optional(),
})
export type ToolDef = z.infer<typeof ToolSchema>

// Registry catalog (one entry per backing registry — dev, prod).
// `images` is what /v2/_catalog returns expanded with per-image tags.
export const RegistryImageSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()).default([]),
})
export const RegistrySummarySchema = z.object({
  name: z.string(),
  url: z.string(),
  host_url: z.string().optional(),
  status: z.enum(['online', 'offline']),
  images: z.array(RegistryImageSchema).default([]),
  error: z.string().optional(),
})
export const RegistryCatalogResponseSchema = z.object({
  registries: z.array(RegistrySummarySchema),
})
export type RegistryImage = z.infer<typeof RegistryImageSchema>
export type RegistrySummary = z.infer<typeof RegistrySummarySchema>

export const HallucinationStateSchema = z.object({
  enabled: z.boolean(),
})

export const VerifyResponseSchema = z.object({
  ok: z.boolean(),
  output: z.string().default(''),
  error: z.string().optional(),
})

export const ProbeResultSchema = z.object({
  status: z.number(),
  body: z.unknown(),
})
export type ProbeResult = z.infer<typeof ProbeResultSchema>
