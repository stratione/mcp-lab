import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ProviderChip } from './ProviderChip'
import { useLab } from '@/lib/store'
import { send } from '@/lib/chat'

export function InputRow() {
  const [value, setValue] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const abort = useLab((s) => s.abort)
  const isStreaming = abort != null

  function autoGrow() {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }

  async function submit() {
    if (!value.trim() || isStreaming) return
    const text = value
    setValue('')
    queueMicrotask(autoGrow)
    await send(text)
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-border bg-surface px-5 py-3 flex items-end gap-2">
      <ProviderChip />
      <textarea
        ref={ta}
        rows={1}
        value={value}
        onChange={(e) => { setValue(e.target.value); autoGrow() }}
        onKeyDown={onKey}
        className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm placeholder-faint resize-none max-h-60"
        placeholder="Ask the lab…"
        data-testid="chat-input"
      />
      {isStreaming ? (
        <button
          onClick={() => abort?.abort()}
          className="bg-err text-white rounded-md px-3 py-2 text-sm font-medium"
          data-testid="chat-stop"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="bg-primary text-primary-fg rounded-md px-3 py-2 text-sm font-medium disabled:opacity-40"
          data-testid="chat-send"
        >
          Send
        </button>
      )}
    </div>
  )
}
