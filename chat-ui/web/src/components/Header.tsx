import { useState } from 'react'
import { CornerMenu } from './CornerMenu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { McpServerDiagram } from './McpServerDiagram'
import { McpHelpDialog } from './McpHelpDialog'
import { useLab } from '@/lib/store'

export function Header() {
  const [archOpen, setArchOpen] = useState(false)
  const [anatomyOpen, setAnatomyOpen] = useState(false)
  // Workshop / Walkthrough button: toggles the modal open/closed. Replaces the
  // ?workshop=1 URL flag as the primary entry point — the flag still works
  // as a deep link (Workshop.tsx detects it on mount) but new users land on
  // a clean localhost:3001 and click this button when they want the tour.
  const workshopMode = useLab((s) => s.workshopMode)
  const setWorkshopMode = useLab((s) => s.setWorkshopMode)
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-3">
        <a
          href="https://devopsdays.org/events/2026-austin"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
          title="DevOpsDays Austin 2026"
        >
          <img
            src={`${import.meta.env.BASE_URL}austin-devopsdays-2026.png`}
            alt="DevOpsDays Austin 2026"
            className="h-7 w-auto block"
          />
        </a>
        <span className="text-faint">·</span>
        <span className="font-semibold text-sm">MCP DevOps Lab</span>
        <Dialog open={archOpen} onOpenChange={setArchOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="ml-2 text-xs text-muted hover:text-text border border-border rounded-md px-2 py-1 transition-colors"
              data-testid="architecture-button"
              title="Show system architecture diagram"
            >
              ◇ Architecture
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>System Architecture</DialogTitle>
            </DialogHeader>
            <ArchitectureDiagram />
          </DialogContent>
        </Dialog>
        <Dialog open={anatomyOpen} onOpenChange={setAnatomyOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="text-xs text-muted hover:text-text border border-border rounded-md px-2 py-1 transition-colors"
              data-testid="mcp-anatomy-button"
              title="Inside one MCP server — the four layers a tool call passes through"
            >
              ◇ MCP Internals
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>What's inside an MCP server</DialogTitle>
            </DialogHeader>
            <McpServerDiagram />
          </DialogContent>
        </Dialog>
        <button
          type="button"
          onClick={() => setWorkshopMode(!workshopMode)}
          className={
            'text-xs border border-border rounded-md px-2 py-1 transition-colors ' +
            (workshopMode
              ? 'text-text bg-surface-2'
              : 'text-muted hover:text-text')
          }
          data-testid="walkthrough-button"
          aria-pressed={workshopMode}
          title={
            workshopMode
              ? 'Close the guided walkthrough (your progress is saved).'
              : 'Open a guided tour through the lab — ask without tools, enable an MCP, watch grounded answers replace hallucinations.'
          }
        >
          ◇ {workshopMode ? 'Walkthrough (open)' : 'Walkthrough'}
        </button>
        <McpHelpDialog />
      </div>
      <CornerMenu />
    </header>
  )
}
