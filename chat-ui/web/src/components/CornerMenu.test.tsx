import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CornerMenu } from './CornerMenu'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }))

// CornerMenu now uses InfoDot (a Radix Tooltip), which the app mounts under a
// TooltipProvider at the root; provide one for isolated render.
const renderMenu = () => render(<TooltipProvider><CornerMenu /></TooltipProvider>)

describe('CornerMenu', () => {
  it('opens on click and shows theme + density sections', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(await screen.findByText(/theme/i)).toBeInTheDocument()
    expect(screen.getByText(/density/i)).toBeInTheDocument()
    expect(screen.getByText(/flying blind/i)).toBeInTheDocument()
  })

  it('toggles density when Large is clicked', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^large$/i }))
    expect(document.documentElement.dataset.density).toBe('large')
  })

  it('toggles theme to light', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^light$/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
