import { useEffect } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useLab } from '@/lib/store'
import { applyTheme } from '@/lib/theme'
import { useQuery } from '@tanstack/react-query'
import { getTools, setHallucinationMode } from '@/lib/api'

export function CmdK() {
  const open = useLab((s) => s.cmdkOpen)
  const setOpen = useLab((s) => s.setCmdkOpen)
  const setTab = useLab((s) => s.setInspectorTab)
  const clear = useLab((s) => s.clearMessages)
  const flyingBlind = useLab((s) => s.flyingBlind)
  const setFlying = useLab((s) => s.setFlyingBlind)
  const { data: tools } = useQuery({
    queryKey: ['tools'],
    queryFn: ({ signal }) => getTools(signal),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  function go(action: () => void) {
    return () => { action(); setOpen(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl overflow-hidden">
        <Command>
          <CommandInput placeholder="Search actions, tools, servers…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem onSelect={go(() => applyTheme('light'))}>Set theme: Light</CommandItem>
              <CommandItem onSelect={go(() => applyTheme('dark'))}>Set theme: Dark</CommandItem>
              <CommandItem
                onSelect={go(async () => {
                  const next = !flyingBlind
                  setFlying(next)
                  await setHallucinationMode(next)
                })}
              >
                Toggle Flying Blind ({flyingBlind ? 'on → off' : 'off → on'})
              </CommandItem>
              <CommandItem onSelect={go(clear)}>Clear chat</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              <CommandItem onSelect={go(() => setTab('servers'))}>Focus inspector → Servers</CommandItem>
              <CommandItem onSelect={go(() => setTab('tools'))}>Focus inspector → Tools</CommandItem>
              <CommandItem onSelect={go(() => setTab('trace'))}>Focus inspector → Trace</CommandItem>
              <CommandItem onSelect={go(() => setTab('compare'))}>Focus inspector → Compare</CommandItem>
            </CommandGroup>
            {tools?.tools?.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Tools (${tools.tools.length})`}>
                  {tools.tools.map((t) => (
                    <CommandItem
                      key={t.name}
                      value={`tool ${t.name} ${t.description}`}
                      onSelect={go(() => setTab('tools'))}
                    >
                      <span className="font-mono">{t.name}</span>
                      <span className="ml-2 text-xs text-muted truncate">{t.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
