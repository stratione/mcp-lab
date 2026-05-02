import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useLab } from '@/lib/store'

const ROWS: [string, string][] = [
  ['⌘ K', 'Open command palette'],
  ['⌘ J', 'Toggle theme'],
  ['⇧⌘ H', 'Toggle Flying Blind'],
  ['⌘ + / ⌘ −', 'Density bump'],
  ['⌘ 0', 'Density reset'],
  ['⇧⌘ ⌫', 'Clear chat'],
  ['?', 'Show this'],
  ['Esc', 'Close popovers'],
]

export function Shortcuts() {
  const open = useLab((s) => s.shortcutsOpen)
  const setOpen = useLab((s) => s.setShortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <table className="w-full text-sm mt-2">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k} className="border-b border-border last:border-b-0">
                <td className="py-1.5">
                  <kbd className="font-mono text-xs bg-surface-2 border border-border border-b-2 rounded px-1.5">{k}</kbd>
                </td>
                <td className="py-1.5 text-muted">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  )
}
