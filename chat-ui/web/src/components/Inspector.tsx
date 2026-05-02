import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLab, type InspectorTab } from '@/lib/store'
import { ServersTab } from '@/features/servers/ServersTab'
import { ToolsTab } from '@/features/tools/ToolsTab'
import { TraceTab } from '@/features/trace/TraceTab'
import { CompareTab } from '@/features/compare/CompareTab'
import { TryTab } from '@/features/try/TryTab'

const STORAGE_KEY = 'mcp-lab.inspector-width'
const DEFAULT_WIDTH = 360
const MIN_WIDTH = 280
const MAX_WIDTH_PCT = 0.7

function clampWidth(w: number) {
  const max = Math.floor(window.innerWidth * MAX_WIDTH_PCT)
  return Math.min(Math.max(MIN_WIDTH, w), max)
}

export function Inspector() {
  const tab = useLab((s) => s.inspectorTab)
  const setTab = useLab((s) => s.setInspectorTab)
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_WIDTH
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(width))
  }, [width])

  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const dragX = useRef<number | null>(null)
  function startDrag(e: React.MouseEvent) {
    e.preventDefault()
    dragX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function move(ev: MouseEvent) {
      if (dragX.current === null) return
      const delta = dragX.current - ev.clientX
      dragX.current = ev.clientX
      setWidth((w) => clampWidth(w + delta))
    }
    function up() {
      dragX.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function toggleWide() {
    const wide = Math.floor(window.innerWidth * MAX_WIDTH_PCT)
    setWidth((w) => (w >= wide - 4 ? DEFAULT_WIDTH : wide))
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative shrink-0 border-l border-border bg-surface flex flex-col"
      data-testid="inspector"
    >
      <div
        onMouseDown={startDrag}
        onDoubleClick={toggleWide}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to toggle wide"
        className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/60 transition-colors z-10"
        data-testid="inspector-resize-handle"
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as InspectorTab)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="bg-transparent justify-start gap-3 px-3 pt-3 pb-2 h-auto rounded-none border-b border-border">
          {(['servers', 'tools', 'trace', 'compare', 'try'] as const).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="capitalize text-xs px-0 pb-1.5 rounded-none data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:font-semibold data-[state=active]:border-b-2 data-[state=active]:border-text data-[state=inactive]:text-muted"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TabsContent value="servers" className="m-0"><ServersTab /></TabsContent>
          <TabsContent value="tools" className="m-0"><ToolsTab /></TabsContent>
          <TabsContent value="trace" className="m-0"><TraceTab /></TabsContent>
          <TabsContent value="compare" className="m-0"><CompareTab /></TabsContent>
          <TabsContent value="try" className="m-0"><TryTab /></TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}
