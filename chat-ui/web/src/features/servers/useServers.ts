import { useQuery } from '@tanstack/react-query'
import { getMcpStatus } from '@/lib/api'
import type { McpServer } from '@/lib/schemas'
import type { Query } from '@tanstack/react-query'

export function useServers() {
  // Single query with adaptive interval based on data state.
  return useQuery({
    queryKey: ['mcp-status'],
    queryFn: ({ signal }) => getMcpStatus(signal),
    refetchInterval: (query: Query<McpServer[], Error, McpServer[]>) => {
      const data = query.state.data
      if (!data) return 30_000
      const anyOffline = data.some((s) => s.status !== 'online')
      return anyOffline ? 3_000 : 30_000
    },
  })
}
