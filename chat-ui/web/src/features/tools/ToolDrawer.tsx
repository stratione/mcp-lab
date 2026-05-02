import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { ToolDef } from '@/lib/schemas'

export function ToolDrawer({ tool, onClose }: { tool: ToolDef | null; onClose: () => void }) {
  return (
    <Dialog open={!!tool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {tool && (
          <>
            <DialogTitle className="font-mono">{tool.name}</DialogTitle>
            <p className="text-sm text-muted">{tool.description || '—'}</p>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">JSON Schema</div>
              <pre className="bg-bg border border-border rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-72 overflow-auto">
                {JSON.stringify(tool.inputSchema ?? {}, null, 2)}
              </pre>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
