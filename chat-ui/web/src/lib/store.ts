import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ToolCall } from './schemas'

export type Role = 'user' | 'assistant' | 'system'
export type ChatMessageView = {
  id: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  status?: 'pending' | 'ok' | 'error' | 'stopped'
  error?: string
  // The provider+model that produced this message (assistant only). Rendered
  // as a small tag next to the bubble so users can tell which model answered
  // each message — useful when switching providers mid-conversation.
  provider?: string
  model?: string
}

export type TraceEntry = {
  id: string
  ts: number
  name: string
  ok: boolean
  durationMs?: number
  messageId: string
}

// 'tools' was retired when the per-server tool list moved into the MCP
// servers tab. The store's setter coerces stale persisted 'tools' values
// back to 'servers' so old localStorage doesn't break the tab bar.
export type InspectorTab = 'servers' | 'trace' | 'compare' | 'try' | 'walkthrough'

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

  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void

  abort: AbortController | null
  setAbort: (ac: AbortController | null) => void

  sessionTokens: number
  addTokens: (n: number) => void
  resetTokens: () => void

  flyingBlind: boolean
  setFlyingBlind: (v: boolean) => void

  walkthroughKick: number
  kickWalkthrough: () => void

  workshopMode: boolean
  setWorkshopMode: (v: boolean) => void

  workshopStep: number
  setWorkshopStep: (n: number) => void

  pendingPrompt: string | null
  setPendingPrompt: (s: string | null) => void
}

export const useLab = create<LabState>()(
  persist(
    (set) => ({
      messages: [],
      appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      patchMessage: (id, patch) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      clearMessages: () => set({ messages: [], sessionTokens: 0, traces: [] }),

      traces: [],
      appendTrace: (t) => set((s) => ({ traces: [...s.traces, t] })),
      clearTraces: () => set({ traces: [] }),

      inspectorTab: 'servers',
      setInspectorTab: (t) =>
        // Coerce the retired 'tools' value (still in older callers / persisted
        // state) back to 'servers' since the tools list now lives there.
        set({ inspectorTab: (t as string) === 'tools' ? 'servers' : t }),

      cmdkOpen: false,
      setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),

      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

      abort: null,
      setAbort: (abort) => set({ abort }),

      sessionTokens: 0,
      addTokens: (n) => set((s) => ({ sessionTokens: s.sessionTokens + n })),
      resetTokens: () => set({ sessionTokens: 0 }),

      // Default ON: a fresh load opens with the model fabricating; the App
      // effect clears this the first time any MCP comes online so the
      // workshop arc "lies → enable a tool → grounded" works without the
      // attendee having to find the corner-menu toggle.
      flyingBlind: true,
      setFlyingBlind: (flyingBlind) => set({ flyingBlind }),

      walkthroughKick: 0,
      kickWalkthrough: () => set((s) => ({ walkthroughKick: s.walkthroughKick + 1 })),

      workshopMode: false,
      setWorkshopMode: (workshopMode) => set({ workshopMode }),

      workshopStep: 0,
      setWorkshopStep: (workshopStep) => set({ workshopStep }),

      pendingPrompt: null,
      setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
    }),
    {
      // Persist chat history + traces + token totals across browser refresh.
      // Everything else is ephemeral UI state (which tab is open, whether
      // CmdK is showing, the active AbortController, etc.) and is intentionally
      // excluded — persisting it would surprise users by re-opening dialogs
      // on reload, and AbortController isn't even serializable.
      name: 'mcp-lab.chat.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        messages: s.messages,
        traces: s.traces,
        sessionTokens: s.sessionTokens,
      }),
      // If a 'pending' message was on screen when the user refreshed, it'll
      // never resolve — convert it to an error so the UI shows a Retry button
      // instead of a frozen "…" forever.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.messages = state.messages.map((m) =>
          m.status === 'pending'
            ? { ...m, status: 'error', error: 'Request was interrupted by a page reload.' }
            : m,
        )
      },
    },
  ),
)
