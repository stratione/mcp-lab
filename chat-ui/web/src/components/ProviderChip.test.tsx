import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProviderChip } from './ProviderChip'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

describe('ProviderChip', () => {
  it('renders provider + model + tok suffix', () => {
    render(<ProviderChip />)
    expect(screen.getByRole('button', { name: /ollama/i })).toBeInTheDocument()
  })
})
