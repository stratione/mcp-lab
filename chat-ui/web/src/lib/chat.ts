import { sendChat, appendChatHistory, ApiError } from './api'
import { useLab, type ChatMessageView } from './store'
import { toast } from '@/hooks/use-toast'

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
    for (const tc of res.tool_calls) {
      const ok = tc.result != null && !String(tc.result).startsWith('Error')
      state.appendTrace({
        id: `t${Date.now()}-${Math.random()}`,
        ts: Date.now(),
        name: tc.name,
        ok,
        messageId: pendingId,
      })
    }
    state.addTokens(res.token_usage.total_tokens)
    appendChatHistory({ role: 'user', content: text }).catch(() => {})
    appendChatHistory({ role: 'assistant', content: res.reply }).catch(() => {})
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      state.patchMessage(pendingId, { status: 'stopped', content: '(stopped)' })
    } else {
      const msg = e instanceof Error ? e.message : 'Failed'
      state.patchMessage(pendingId, { status: 'error', error: msg })
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        toast({ title: 'API key looks wrong', description: 'Check the chip popover below.', variant: 'destructive' })
      } else {
        toast({ title: "Couldn't reach the lab", description: msg, variant: 'destructive' })
      }
    }
  } finally {
    state.setAbort(null)
  }
}
