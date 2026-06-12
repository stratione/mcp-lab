import { cn } from '@/lib/utils'

// Shimmer placeholder for async content — a pulsing surface block. Used in
// place of bare "Loading…" text so the UI keeps its shape while data arrives.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} {...props} />
}

export { Skeleton }
