import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLab, type InspectorTab } from '@/lib/store'
import { ServersTab } from '@/features/servers/ServersTab'
import { ToolsTab } from '@/features/tools/ToolsTab'
import { TraceTab } from '@/features/trace/TraceTab'
import { CompareTab } from '@/features/compare/CompareTab'

export function Inspector() {
  const tab = useLab((s) => s.inspectorTab)
  const setTab = useLab((s) => s.setInspectorTab)
  return (
    <aside data-testid="inspector" className="w-[360px] shrink-0 border-l border-border bg-surface flex flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as InspectorTab)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="bg-transparent justify-start gap-3 px-3 pt-3 pb-2 h-auto rounded-none border-b border-border">
          {(['servers', 'tools', 'trace', 'compare'] as const).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              data-testid={`inspector-tab-${t}`}
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
        </div>
      </Tabs>
    </aside>
  )
}
