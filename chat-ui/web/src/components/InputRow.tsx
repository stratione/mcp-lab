import { ProviderChip } from './ProviderChip'

export function InputRow() {
  return (
    <div className="border-t border-border bg-surface px-5 py-3 flex items-center gap-2">
      <ProviderChip />
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
