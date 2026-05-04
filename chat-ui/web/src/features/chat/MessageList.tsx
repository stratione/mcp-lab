import { useEffect, useRef } from 'react'
import { useLab } from '@/lib/store'
import { send } from '@/lib/chat'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolCallSummary } from './ToolCallSummary'

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
          <div className="text-muted text-center py-12 text-sm">
            Welcome to the MCP DevOps Lab. Pick a provider in the chip below and start chatting.
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
