export function InputRow() {
  return (
    <div className="border-t border-border bg-surface px-5 py-3 flex items-center gap-2">
      <span className="text-xs text-muted px-2 py-1 rounded-md border border-border bg-bg whitespace-nowrap">
        ⬩ ollama · llama3.1 · 0 tok ▾
      </span>
      <input
        className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm placeholder-faint"
        placeholder="Ask the lab…"
      />
      <button className="bg-primary text-primary-fg rounded-md px-3 py-2 text-sm font-medium">
        Send
      </button>
    </div>
  )
}
