// Learn Mode left rail — the course map. One row per module with a progress
// ring; the active module gets the violet accent. KodeKloud-style: you can
// always see where you are in the course and how much of it is done.
import { useLab } from '@/lib/store'
import { LEARN_MODULES } from './curriculum'
import { moduleProgress, useLearnProgress } from './useLearnProgress'

function ProgressRing({ fraction }: { fraction: number }) {
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.5" className="stroke-border" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        transform="rotate(-90 11 11)"
        className={fraction >= 1 ? 'stroke-ok' : 'stroke-primary'}
      />
      {fraction >= 1 && (
        <path
          d="M7.5 11.5l2.2 2.2 4.4-4.9"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          className="stroke-ok"
        />
      )}
    </svg>
  )
}

export function CourseRail() {
  const learnModule = useLab((s) => s.learnModule)
  const setLearnModule = useLab((s) => s.setLearnModule)
  const { data: progress } = useLearnProgress()

  const allStepIds = LEARN_MODULES.flatMap((m) => m.steps.map((s) => s.id))
  const total = moduleProgress(progress, allStepIds)

  return (
    <nav
      className="w-[250px] shrink-0 border-r border-border bg-surface flex flex-col min-h-0"
      aria-label="Course modules"
    >
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="text-[11px] uppercase tracking-wider text-faint font-medium">Course</div>
        <div className="text-sm font-semibold mt-0.5">DevOps × MCP, hands-on</div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.round(total * 100)}%` }}
          />
        </div>
        <div className="text-[11px] text-muted mt-1">{Math.round(total * 100)}% complete</div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {LEARN_MODULES.map((m) => {
          const active = m.num === learnModule
          const frac = moduleProgress(progress, m.steps.map((s) => s.id))
          return (
            <button
              key={m.num}
              type="button"
              onClick={() => setLearnModule(m.num)}
              aria-current={active ? 'true' : undefined}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                active
                  ? 'bg-primary/10 border-r-2 border-primary'
                  : 'hover:bg-surface-2 border-r-2 border-transparent'
              }`}
            >
              <ProgressRing fraction={frac} />
              <span className="min-w-0">
                <span
                  className={`block text-xs font-medium truncate ${
                    active ? 'text-text' : 'text-muted'
                  }`}
                >
                  {m.num}. {m.title}
                </span>
                <span className="block text-[11px] text-faint truncate">{m.tagline}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="px-4 py-3 border-t border-border text-[11px] text-faint leading-relaxed">
        By hand first, then by agent. Full text:{' '}
        <span className="font-mono">docs/CURRICULUM.md</span>
      </div>
    </nav>
  )
}
