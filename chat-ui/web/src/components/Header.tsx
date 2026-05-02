import { useState } from 'react'
import { CornerMenu } from './CornerMenu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { McpServerDiagram } from './McpServerDiagram'
import { McpHelpDialog } from './McpHelpDialog'

export function Header() {
  const [archOpen, setArchOpen] = useState(false)
  const [anatomyOpen, setAnatomyOpen] = useState(false)
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
        <McpHelpDialog />
      </div>
      <CornerMenu />
    </header>
  )
}
