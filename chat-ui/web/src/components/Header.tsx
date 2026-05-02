import { CornerMenu } from './CornerMenu'

export function Header() {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-2.5">
        <div className="w-[18px] h-[18px] rounded bg-text" />
        <span className="font-semibold text-sm">MCP DevOps Lab</span>
      </div>
      <CornerMenu />
    </header>
  )
}
