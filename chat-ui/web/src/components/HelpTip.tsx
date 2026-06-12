// Rich, teaching-oriented tooltips built on the shadcn/Radix Tooltip primitive.
//
// HelpTip wraps any single element (a button, a chip, a tab) and shows a
// title + body on hover/focus. InfoDot is a self-contained "?" affordance for
// places that have no obvious element to hover. Both pull their copy from
// lib/help.ts so explanations live in one place.
import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Side = 'top' | 'right' | 'bottom' | 'left'

export function HelpTip({
  title,
  body,
  side = 'top',
  contentClassName,
  children,
}: {
  title?: React.ReactNode
  body?: React.ReactNode
  side?: Side
  contentClassName?: string
  /** A single element that forwards its ref (DOM element or Radix primitive). */
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(
          'max-w-[264px] whitespace-normal text-left leading-relaxed px-3 py-2',
          contentClassName,
        )}
      >
        {title && <div className="font-semibold">{title}</div>}
        {body && <div className={cn('text-[11px] opacity-90', title && 'mt-0.5')}>{body}</div>}
      </TooltipContent>
    </Tooltip>
  )
}

export function InfoDot({
  title,
  body,
  side = 'top',
  className,
}: {
  title?: React.ReactNode
  body?: React.ReactNode
  side?: Side
  className?: string
}) {
  return (
    <HelpTip title={title} body={body} side={side}>
      <button
        type="button"
        aria-label={typeof title === 'string' ? `Help: ${title}` : 'Help'}
        className={cn(
          'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-semibold leading-none text-faint align-middle transition-colors hover:text-text',
          className,
        )}
      >
        ?
      </button>
    </HelpTip>
  )
}
