import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTools } from '@/lib/api'
import type { ToolDef } from '@/lib/schemas'
import { ToolDrawer } from './ToolDrawer'

const CATEGORY_FROM_PREFIX: Record<string, string> = {
  list_users: 'user', create_user: 'user', delete_user: 'user', update_user: 'user',
  list_roles: 'user', get_user: 'user', set_role: 'user',
  list_repos: 'gitea', create_repo: 'gitea', delete_repo: 'gitea',
  list_branches: 'gitea', list_commits: 'gitea', get_file: 'gitea', list_orgs: 'gitea',
  list_images: 'registry', list_tags: 'registry', delete_image: 'registry',
  promote_image: 'promotion', list_promotions: 'promotion', rollback_promotion: 'promotion',
}

export function ToolsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tools'],
    queryFn: ({ signal }) => getTools(signal),
    staleTime: 5 * 60_000,
  })
  const [active, setActive] = useState<ToolDef | null>(null)
  const grouped = useMemo(() => {
    const out: Record<string, ToolDef[]> = {}
    for (const t of data?.tools ?? []) {
      const cat = t.category || CATEGORY_FROM_PREFIX[t.name] || 'other'
      ;(out[cat] ||= []).push(t)
    }
    return out
  }, [data])

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading tools…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load tools.</div>

  return (
    <div className="p-3">
      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{cat} · {list.length}</div>
          <div>
            {list.map((t) => (
              <button
                key={t.name}
                onClick={() => setActive(t)}
                className="w-full flex justify-between items-center text-sm font-mono py-1.5 hover:text-text text-left"
              >
                <span>{t.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-faint border border-border bg-bg rounded px-1.5 py-0.5 font-sans">{cat}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <ToolDrawer tool={active} onClose={() => setActive(null)} />
    </div>
  )
}
