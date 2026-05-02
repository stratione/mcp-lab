import { create } from 'zustand'
import type { ToolCall } from './schemas'

export type Role = 'user' | 'assistant' | 'system'
export type ChatMessageView = {
  id: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  status?: 'pending' | 'ok' | 'error' | 'stopped'
  error?: string
}

export type TraceEntry = {
  id: string
  ts: number
  name: string
  ok: boolean
  durationMs?: number
  messageId: string
}

export type InspectorTab = 'servers' | 'tools' | 'trace' | 'compare'

export type LabState = {
  messages: ChatMessageView[]
  appendMessage: (m: ChatMessageView) => void
  patchMessage: (id: string, patch: Partial<ChatMessageView>) => void
  clearMessages: () => void

  traces: TraceEntry[]
  appendTrace: (t: TraceEntry) => void
  clearTraces: () => void

  inspectorTab: InspectorTab
  setInspectorTab: (t: InspectorTab) => void

  cmdkOpen: boolean
  setCmdkOpen: (open: boolean) => void

  abort: AbortController | null
  setAbort: (ac: AbortController | null) => void

  sessionTokens: number
  addTokens: (n: number) => void
  resetTokens: () => void

  flyingBlind: boolean
  setFlyingBlind: (v: boolean) => void
}

export const useLab = create<LabState>((set) => ({
  messages: [],
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patchMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  clearMessages: () => set({ messages: [], sessionTokens: 0, traces: [] }),

  traces: [],
  appendTrace: (t) => set((s) => ({ traces: [...s.traces, t] })),
  clearTraces: () => set({ traces: [] }),

  inspectorTab: 'servers',
  setInspectorTab: (t) => set({ inspectorTab: t }),

  cmdkOpen: false,
  setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),

  abort: null,
  setAbort: (abort) => set({ abort }),

  sessionTokens: 0,
  addTokens: (n) => set((s) => ({ sessionTokens: s.sessionTokens + n })),
  resetTokens: () => set({ sessionTokens: 0 }),

  flyingBlind: false,
  setFlyingBlind: (flyingBlind) => set({ flyingBlind }),
}))
