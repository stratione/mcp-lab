import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HelpTip, InfoDot } from './HelpTip'

describe('HelpTip', () => {
  it('renders the wrapped trigger element', () => {
    render(
      <TooltipProvider>
        <HelpTip title="Registry" body="where images live">
          <button>registry-dev</button>
        </HelpTip>
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: 'registry-dev' })).toBeInTheDocument()
  })

  it('InfoDot exposes an accessible help label', () => {
    render(
      <TooltipProvider>
        <InfoDot title="Scan gate" body="blocks vulnerable images" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: 'Help: Scan gate' })).toBeInTheDocument()
  })
})
