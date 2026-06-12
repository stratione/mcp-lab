import { useState } from 'react'
import { CornerMenu } from './CornerMenu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { HelpTip } from './HelpTip'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { McpServerDiagram } from './McpServerDiagram'
import { McpHelpDialog } from './McpHelpDialog'
import { PipelineBoard } from './PipelineBoard'
import { useLab } from '@/lib/store'

export function Header() {
  const [archOpen, setArchOpen] = useState(false)
  const [anatomyOpen, setAnatomyOpen] = useState(false)
  const [pipelineOpen, setPipelineOpen] = useState(false)
  // Workshop / Walkthrough button: toggles workshopMode and surfaces the
  // Walkthrough inspector tab so the tour is immediately visible. The
  // walkthrough lives permanently as a tab next to Try — there's no
  // floating panel and no URL deep link. This button is the only entry.
  const workshopMode = useLab((s) => s.workshopMode)
  const setWorkshopMode = useLab((s) => s.setWorkshopMode)
  const setInspectorTab = useLab((s) => s.setInspectorTab)
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-sm flex items-center gap-1.5 shrink-0">
          <span aria-hidden>⛓</span> MCP DevOps Lab
        </span>
        <Dialog open={archOpen} onOpenChange={setArchOpen}>
          <HelpTip
            side="bottom"
            title="System architecture"
            body="A diagram of every service in the lab and how they connect."
          >
            <DialogTrigger asChild>
              <button
                type="button"
                className="ml-2 text-xs text-muted hover:text-text border border-border rounded-md px-2 py-1 transition-colors"
                data-testid="architecture-button"
              >
                ◇ Architecture
              </button>
            </DialogTrigger>
          </HelpTip>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>System Architecture</DialogTitle>
            </DialogHeader>
            <ArchitectureDiagram />
          </DialogContent>
        </Dialog>
        <Dialog open={anatomyOpen} onOpenChange={setAnatomyOpen}>
          <HelpTip
            side="bottom"
            title="Inside an MCP server"
            body="The four layers a tool call passes through — transport, protocol, handler, and the backing service."
          >
            <DialogTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted hover:text-text border border-border rounded-md px-2 py-1 transition-colors"
                data-testid="mcp-anatomy-button"
              >
                ◇ MCP Internals
              </button>
            </DialogTrigger>
          </HelpTip>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>What's inside an MCP server</DialogTitle>
            </DialogHeader>
            <McpServerDiagram />
          </DialogContent>
        </Dialog>
        <HelpTip
          side="bottom"
          title="Guided walkthrough"
          body={
            workshopMode
              ? 'Close the guided walkthrough (your progress is saved).'
              : 'A guided tour: ask without tools, enable an MCP, then watch grounded answers replace the hallucinations.'
          }
        >
          <button
            type="button"
            onClick={() => {
              const next = !workshopMode
              setWorkshopMode(next)
              // Surface the Walkthrough tab when opening so the user
              // doesn't click the button, then wonder where the tour went.
              if (next) setInspectorTab('walkthrough')
            }}
            className={
              'text-xs border border-border rounded-md px-2 py-1 transition-colors ' +
              (workshopMode ? 'text-text bg-surface-2' : 'text-muted hover:text-text')
            }
            data-testid="walkthrough-button"
            aria-pressed={workshopMode}
          >
            ◇ {workshopMode ? 'Walkthrough (open)' : 'Walkthrough'}
          </button>
        </HelpTip>
        <HelpTip
          side="bottom"
          title="Pipeline board"
          body="Live CI/CD view: commit → CI → registries → scan gate → promote → deploy."
        >
          <button
            type="button"
            onClick={() => setPipelineOpen(true)}
            className="text-xs text-muted hover:text-text border border-border rounded-md px-2 py-1 transition-colors"
            data-testid="pipeline-button"
          >
            ⛓ Pipeline
          </button>
        </HelpTip>
        <PipelineBoard open={pipelineOpen} onOpenChange={setPipelineOpen} />
        <McpHelpDialog />
      </div>
      <CornerMenu />
    </header>
  )
}
