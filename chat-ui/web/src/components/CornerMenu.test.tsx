import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CornerMenu } from './CornerMenu'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }))

describe('CornerMenu', () => {
  it('opens on click and shows theme + density sections', async () => {
    render(<CornerMenu />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(await screen.findByText(/theme/i)).toBeInTheDocument()
    expect(screen.getByText(/density/i)).toBeInTheDocument()
    expect(screen.getByText(/flying blind/i)).toBeInTheDocument()
  })

  it('toggles density when Large is clicked', async () => {
    render(<CornerMenu />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^large$/i }))
    expect(document.documentElement.dataset.density).toBe('large')
  })

  it('toggles theme to light', async () => {
    render(<CornerMenu />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^light$/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
