// chat-ui/web/src/components/CornerMenu.tsx
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { applyTheme, applyDensity, type Theme, type Density } from '@/lib/theme'
import { useLab } from '@/lib/store'
import { setHallucinationMode } from '@/lib/api'

const THEMES: { v: Theme; label: string }[] = [
  { v: 'light', label: 'Light' },
  { v: 'dark', label: 'Dark' },
  { v: 'system', label: 'System' },
]
const DENSITIES: { v: Density; label: string }[] = [
  { v: 'compact', label: 'Compact' },
  { v: 'comfortable', label: 'Comfortable' },
  { v: 'large', label: 'Large' },
]

export function CornerMenu() {
  const flyingBlind = useLab((s) => s.flyingBlind)
  const setFlying = useLab((s) => s.setFlyingBlind)
  const clearMessages = useLab((s) => s.clearMessages)

  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('mcp-lab.theme') as Theme) || 'dark',
  )
  const [density, setDensity] = useState<Density>(
    (localStorage.getItem('mcp-lab.density') as Density) || 'comfortable',
  )
  const [scale, setScale] = useState<number>(
    Number(localStorage.getItem('mcp-lab.scale')) || 1,
  )

  function pickTheme(t: Theme) { setTheme(t); applyTheme(t) }
  function pickDensity(d: Density) {
    setDensity(d)
    const presetScale = d === 'compact' ? 0.85 : d === 'large' ? 1.18 : 1
    setScale(presetScale)
    applyDensity(d, presetScale)
  }
  function pickScale(s: number) { setScale(s); applyDensity(density, s) }
  async function toggleFlying() {
    const next = !flyingBlind
    setFlying(next)
    await setHallucinationMode(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="px-2 py-1 rounded-md border border-border bg-surface-2 text-muted hover:text-text"
          aria-label="Open menu"
        >
          ⋯
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-2">
        <Section label="Theme">
          <Segmented options={THEMES} value={theme} onChange={pickTheme} />
        </Section>
        <Section label="Density">
          <Segmented options={DENSITIES} value={density} onChange={pickDensity} />
          <div className="flex items-center gap-2 px-2 mt-2">
            <span className="text-[10px]">A</span>
            <Slider
              min={0.7} max={1.4} step={0.01} value={[scale]}
              onValueChange={(v) => pickScale(v[0])}
              className="flex-1"
            />
            <span className="text-sm">A</span>
            <span className="text-xs text-muted w-10 text-right">{Math.round(scale * 100)}%</span>
          </div>
        </Section>
        <Divider />
        <Row>
          <span>Flying Blind <span className="text-faint text-xs">no tools</span></span>
          <Switch checked={flyingBlind} onCheckedChange={toggleFlying} />
        </Row>
        <Divider />
        <RowButton onClick={() => { /* walkthrough later */ }}>
          Walkthrough <Kbd>first run</Kbd>
        </RowButton>
        <RowButton onClick={clearMessages}>
          Clear chat <Kbd>⇧⌘ ⌫</Kbd>
        </RowButton>
        <RowButton onClick={() => alert('Shortcuts dialog wired in Task 32')}>
          Keyboard shortcuts <Kbd>?</Kbd>
        </RowButton>
        <Divider />
        <RowButton onClick={() => useLab.getState().setCmdkOpen(true)}>
          <span className="text-muted">Open Command Palette</span> <Kbd>⌘ K</Kbd>
        </RowButton>
      </PopoverContent>
    </Popover>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wider text-faint px-2 pt-2 pb-1">{label}</div>
      {children}
    </div>
  )
}
function Segmented<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-3 mx-2 border border-border rounded-md overflow-hidden">
      {options.map(({ v, label }, i) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={[
            'py-1.5 text-xs',
            i < options.length - 1 ? 'border-r border-border' : '',
            v === value ? 'bg-text text-bg font-semibold' : 'bg-surface-2 text-muted',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between px-2 py-1.5 text-sm">{children}</div>
}
function RowButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-surface-2"
    >
      {children}
    </button>
  )
}
function Divider() { return <div className="h-px bg-border my-1.5 mx-1" /> }
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] bg-surface-2 border border-border border-b-2 rounded px-1.5 py-0.5 text-muted">
      {children}
    </span>
  )
}
