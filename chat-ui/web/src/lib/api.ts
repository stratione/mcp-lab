import { z } from 'zod'
import {
  ChatResponseSchema,
  McpStatusResponseSchema,
  ProvidersResponseSchema,
  ToolsResponseSchema,
  HallucinationStateSchema,
  VerifyResponseSchema,
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

export const getProviders = (signal?: AbortSignal) =>
  call('/api/providers', ProvidersResponseSchema, undefined, signal)

export const setProvider = (cfg: {
  provider: string
  api_key?: string
  model?: string
  base_url?: string
}) => call('/api/provider', z.unknown(), json(cfg))

export const getHallucinationMode = (signal?: AbortSignal) =>
  call('/api/hallucination-mode', HallucinationStateSchema, undefined, signal)

export const setHallucinationMode = (enabled: boolean) =>
  call('/api/hallucination-mode', HallucinationStateSchema, json({ enabled }))

export const probeServer = (name: string) =>
  call('/api/probe', VerifyResponseSchema, json({ name }))

export const sendChatCompare = (body: unknown) =>
  call('/api/chat-compare', z.unknown(), json(body))

export const getChatHistory = () => call('/api/chat-history', z.unknown())

export const appendChatHistory = (msg: ChatMessage) =>
  call('/api/chat-history', z.unknown(), json(msg))

export const clearChatHistory = () =>
  call('/api/chat-history', z.unknown(), { method: 'DELETE' })

export type { ChatResponse, ToolDef, McpServer }
