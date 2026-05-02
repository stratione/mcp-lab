import { sendChat, appendChatHistory } from './api'
import { useLab, type ChatMessageView } from './store'

let nextId = 1
const id = () => `m${nextId++}`

export async function send(input: string) {
  const text = input.trim()
  if (!text) return
  const state = useLab.getState()
  const userMsg: ChatMessageView = { id: id(), role: 'user', content: text, status: 'ok' }
  state.appendMessage(userMsg)
  const pendingId = id()
  state.appendMessage({ id: pendingId, role: 'assistant', content: '', status: 'pending' })

  const ac = new AbortController()
  state.setAbort(ac)
  try {
    const res = await sendChat(
      {
        message: text,
        history: state.messages.map((m) => ({
          role: m.role === 'system' ? 'system' : m.role,
          content: m.content,
        })),
      },
      ac.signal,
    )
    state.patchMessage(pendingId, {
      content: res.reply,
      toolCalls: res.tool_calls,
      status: 'ok',
    })
    state.addTokens(res.token_usage.total_tokens)
    appendChatHistory({ role: 'user', content: text }).catch(() => {})
    appendChatHistory({ role: 'assistant', content: res.reply }).catch(() => {})
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'AbortError') {
      state.patchMessage(pendingId, { status: 'stopped', content: '(stopped)' })
    } else {
      state.patchMessage(pendingId, {
        status: 'error',
        error: (e as { message?: string })?.message || 'Failed',
      })
    }
  } finally {
    state.setAbort(null)
  }
}
