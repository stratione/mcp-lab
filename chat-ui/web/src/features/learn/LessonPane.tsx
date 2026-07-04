// Learn Mode center pane — the lesson. Steps render as cards (concept /
// by-hand / by-agent / break-fix drill), commands are copyable, agent prompts
// can be handed straight to the chat input, and the module's Verify button
// runs the real labctl check server-side.
import { useState } from 'react'
import { useLab } from '@/lib/store'
import { moduleByNum, type LearnStep } from './curriculum'
import { useLearnProgress, useModuleCheck, useToggleStep } from './useLearnProgress'

const KIND_META: Record<LearnStep['kind'], { label: string; cls: string }> = {
  concept: { label: 'Concept', cls: 'bg-primary/15 text-primary' },
  hand: { label: 'By hand', cls: 'bg-ok/15 text-ok' },
  agent: { label: 'By agent', cls: 'bg-tool-bg text-tool-fg' },
  drill: { label: 'Break-fix drill', cls: 'bg-warn/15 text-warn' },
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative group">
      <pre className="text-[12px] leading-relaxed font-mono bg-bg border border-border rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="absolute top-1.5 right-1.5 text-[11px] rounded-md border border-border bg-surface px-2 py-0.5 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  )
}

function StepCard({ step, done, onToggle }: { step: LearnStep; done: boolean; onToggle: () => void }) {
  const meta = KIND_META[step.kind]
  const setPendingPrompt = useLab((s) => s.setPendingPrompt)
  return (
    <section
      className={`rounded-xl border bg-surface p-4 transition-colors ${
        done ? 'border-ok/40' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${step.title}" ${done ? 'not done' : 'done'}`}
          onClick={onToggle}
          className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center text-[12px] transition-colors ${
            done ? 'bg-ok border-ok text-white' : 'border-border hover:border-muted'
          }`}
        >
          {done ? '✓' : ''}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${meta.cls}`}>
              {meta.label}
            </span>
            <h3 className="text-sm font-semibold">{step.title}</h3>
          </div>
          {step.body && <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{step.body}</p>}
          {step.commands?.map((c) => (
            <div key={c} className="mt-2.5">
              <CopyBlock text={c} />
            </div>
          ))}
          {step.expected && (
            <p className="text-[12px] text-faint mt-2">
              <span className="text-ok">Expect:</span> {step.expected}
            </p>
          )}
          {step.agentPrompt && (
            <div className="mt-2.5 rounded-lg border border-tool-fg/30 bg-tool-bg/30 p-3">
              <div className="text-[12px] leading-relaxed italic">“{step.agentPrompt}”</div>
              <button
                type="button"
                onClick={() => setPendingPrompt(step.agentPrompt ?? null)}
                className="mt-2 text-[11px] rounded-md border border-tool-fg/40 text-tool-fg px-2 py-1 hover:bg-tool-bg/60 transition-colors"
              >
                Put in chat →
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function LessonPane() {
  const learnModule = useLab((s) => s.learnModule)
  const setLearnModule = useLab((s) => s.setLearnModule)
  const mod = moduleByNum(learnModule)
  const { data: progress } = useLearnProgress()
  const toggle = useToggleStep()
  const check = useModuleCheck()

  return (
    <main className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <header>
          <div className="text-[11px] uppercase tracking-wider text-faint font-medium">
            Module {mod.num} of 8
          </div>
          <h2 className="text-xl font-semibold mt-1">{mod.title}</h2>
          <p className="text-sm text-muted mt-1">{mod.tagline}</p>
        </header>

        <div className="flex flex-col gap-3 mt-5">
          {mod.steps.map((s) => (
            <StepCard
              key={s.id}
              step={s}
              done={!!progress?.done[s.id]}
              onToggle={() => toggle.mutate({ stepId: s.id, done: !progress?.done[s.id] })}
            />
          ))}
        </div>

        {/* Verify — the same check `./labctl check <n>` runs, via the backend. */}
        <section className="mt-5 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Verify your work</h3>
              <p className="text-[12px] text-muted mt-0.5">
                PASS means: {mod.checkMeans} Same check as{' '}
                <span className="font-mono">./labctl check {mod.num}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => check.mutate(mod.num)}
              disabled={check.isPending}
              className="shrink-0 rounded-lg bg-primary text-primary-fg text-xs font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
              data-testid="learn-verify-button"
            >
              {check.isPending ? 'Checking…' : `Verify module ${mod.num}`}
            </button>
          </div>
          {check.data && (
            <div
              role="status"
              className={`mt-3 rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${
                check.data.passed
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-err/40 bg-err/10 text-err'
              }`}
            >
              <strong className="font-semibold">{check.data.passed ? 'PASS' : 'FAIL'}</strong>{' '}
              — {check.data.detail}
              {!check.data.passed && check.data.hint && (
                <div className="text-text/80 mt-1">Hint: {check.data.hint}</div>
              )}
            </div>
          )}
          {check.isError && (
            <div role="status" className="mt-3 rounded-lg border border-err/40 bg-err/10 px-3 py-2.5 text-[12px] text-err">
              Check failed to run — is the lab up? (<span className="font-mono">./labctl status</span>)
            </div>
          )}
        </section>

        <div className="flex justify-between mt-6 mb-2">
          <button
            type="button"
            onClick={() => setLearnModule(Math.max(1, mod.num - 1))}
            disabled={mod.num <= 1}
            className="text-xs text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 disabled:opacity-40 transition-colors"
          >
            ← Module {Math.max(1, mod.num - 1)}
          </button>
          <button
            type="button"
            onClick={() => setLearnModule(Math.min(8, mod.num + 1))}
            disabled={mod.num >= 8}
            className="text-xs text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 disabled:opacity-40 transition-colors"
          >
            Module {Math.min(8, mod.num + 1)} →
          </button>
        </div>
      </div>
    </main>
  )
}
