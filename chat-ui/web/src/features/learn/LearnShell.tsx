// Learn Mode shell — the KodeKloud-style three-column course layout:
// course rail | lesson | agent chat. The right column reuses the classic
// ChatPane + InputRow untouched, so "by hand first, then by agent" is the
// literal screen layout: commands center, agent right.
import { ChatPane } from '@/components/ChatPane'
import { InputRow } from '@/components/InputRow'
import { CourseRail } from './CourseRail'
import { LessonPane } from './LessonPane'

export function LearnShell() {
  return (
    <div className="flex-1 flex min-h-0" data-testid="learn-shell">
      <CourseRail />
      <LessonPane />
      <aside
        className="w-[400px] shrink-0 border-l border-border flex flex-col min-h-0"
        aria-label="Agent chat"
      >
        <div className="px-4 py-2 border-b border-border bg-surface text-[11px] uppercase tracking-wider text-faint font-medium">
          Agent copilot
        </div>
        <ChatPane />
        <InputRow />
      </aside>
    </div>
  )
}
