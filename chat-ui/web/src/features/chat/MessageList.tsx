import { useEffect, useRef } from 'react'
import { useLab } from '@/lib/store'
import { send } from '@/lib/chat'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolCallSummary } from './ToolCallSummary'

// Starter prompts for the empty state. Each is a real task the lab can do once
// a server is on — and a vivid hallucination while Flying Blind, which is the
// opening lesson. One click sends it.
const STARTERS = [
  'List the users in the directory.',
  "What's the latest commit on sample-app?",
  'Which images are in the dev registry?',
  'Promote hello-app:latest from dev to staging.',
]

export function MessageList() {
  const messages = useLab((s) => s.messages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  useEffect(() => {
    if (stickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [messages])

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="flex flex-col gap-2 max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="py-12 px-2 max-w-md mx-auto text-center animate-in fade-in duration-500">
            <div className="text-3xl mb-3 opacity-70" aria-hidden>
              ⛓
            </div>
            <h2 className="text-base font-semibold text-text">MCP DevOps Lab</h2>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">
              Pick a provider in the chip below, then ask the agent something. With no tools enabled
              it will confidently make things up — that's the first lesson. Try one:
            </p>
            <div className="flex flex-col gap-2 mt-5 text-left">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="group text-sm border border-border rounded-lg px-3 py-2 hover:bg-surface-2 hover:border-text/30 transition-colors"
                >
                  <span className="text-faint mr-1.5 group-hover:text-text transition-colors">→</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserMessage key={m.id} content={m.content} />
          ) : (
            <div key={m.id} className="flex flex-col gap-1 self-start w-full">
              {m.toolCalls?.map((tc, i) => <ToolCallSummary key={i} call={tc} />)}
              <AssistantMessage
                content={m.content}
                status={m.status}
                provider={m.provider}
                model={m.model}
              />
              {m.status === 'error' && (
                <div className="flex items-center gap-2 text-err text-xs">
                  <span>⚠ {m.error}</span>
                  <button
                    onClick={() => {
                      // Find most recent user message and re-send.
                      const messages = useLab.getState().messages
                      const idx = messages.findIndex((x) => x.id === m.id)
                      for (let i = idx - 1; i >= 0; i--) {
                        if (messages[i].role === 'user') {
                          send(messages[i].content)
                          break
                        }
                      }
                    }}
                    className="underline hover:text-text"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  )
}
