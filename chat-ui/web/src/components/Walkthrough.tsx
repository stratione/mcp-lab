import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLab } from '@/lib/store'

const STEPS = [
  { title: 'Welcome to the MCP DevOps Lab', body: 'A chat UI that drives a real Docker stack via MCP tools. Pick a provider in the chip below to start.' },
  { title: 'Watch tool calls happen', body: 'Each message can call tools like list_users or promote_image. Click a tool line to expand args + result.' },
  { title: 'The right rail is the lab', body: 'Servers shows live status. Tools is the schema catalog. Trace is the timeline. Compare runs two providers in parallel.' },
  { title: 'Keyboard-first', body: 'Press ⌘K anywhere to switch provider, jump to a tool, or change theme. Press ? to see all shortcuts.' },
]

const KEY = 'mcp-lab.walkthrough.seen.v1'

export function Walkthrough() {
  const kick = useLab((s) => s.walkthroughKick)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  // First-run: open if never seen.
  useEffect(() => {
    if (!localStorage.getItem(KEY)) setOpen(true)
  }, [])

  // Re-open whenever kick increments (CornerMenu trigger).
  useEffect(() => {
    if (kick > 0) {
      setStep(0)
      setOpen(true)
    }
  }, [kick])

  function close() {
    localStorage.setItem(KEY, '1')
    setOpen(false)
  }

  const cur = STEPS[step]
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-md">
        <DialogTitle>{cur.title}</DialogTitle>
        <p className="text-sm text-muted">{cur.body}</p>
        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-faint">{step + 1} / {STEPS.length}</span>
          <div className="flex gap-2">
            {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button size="sm" onClick={close}>Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
