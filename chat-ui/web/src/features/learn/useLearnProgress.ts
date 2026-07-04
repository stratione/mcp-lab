// Learn Mode progress + verify hooks. Progress is a flat map of step ids
// ("<module>.<step>") persisted server-side in the chat-ui volume (same
// pattern as chat history) so it survives reloads AND container restarts.
// Verify runs the real labctl check for a module via the backend, which
// vendors labctl_pkg — one source of truth with `./labctl check <n>`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

const ProgressSchema = z.object({ done: z.record(z.string(), z.boolean()) })
export type LearnProgress = z.infer<typeof ProgressSchema>

const CheckResultSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  hint: z.string(),
})
export type CheckResult = z.infer<typeof CheckResultSchema>

async function fetchProgress(): Promise<LearnProgress> {
  const res = await fetch('/api/curriculum/progress')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return ProgressSchema.parse(await res.json())
}

export function useLearnProgress() {
  return useQuery({ queryKey: ['learn-progress'], queryFn: fetchProgress })
}

export function useToggleStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, done }: { stepId: string; done: boolean }) => {
      const cur = qc.getQueryData<LearnProgress>(['learn-progress']) ?? { done: {} }
      const next = { done: { ...cur.done, [stepId]: done } }
      if (!done) delete next.done[stepId]
      const res = await fetch('/api/curriculum/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return next
    },
    // Optimistic: checkmarks must feel instant in a live workshop.
    onMutate: async ({ stepId, done }) => {
      await qc.cancelQueries({ queryKey: ['learn-progress'] })
      const prev = qc.getQueryData<LearnProgress>(['learn-progress'])
      qc.setQueryData<LearnProgress>(['learn-progress'], (old) => {
        const map = { ...(old?.done ?? {}) }
        if (done) map[stepId] = true
        else delete map[stepId]
        return { done: map }
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['learn-progress'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['learn-progress'] }),
  })
}

export function useModuleCheck() {
  return useMutation({
    mutationFn: async (module: number): Promise<CheckResult> => {
      const res = await fetch(`/api/curriculum/check/${module}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return CheckResultSchema.parse(await res.json())
    },
  })
}

/** Fraction of a module's steps marked done, 0..1. */
export function moduleProgress(
  progress: LearnProgress | undefined,
  stepIds: string[],
): number {
  if (!progress || stepIds.length === 0) return 0
  const done = stepIds.filter((id) => progress.done[id]).length
  return done / stepIds.length
}
