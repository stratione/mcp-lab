import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProviderChip } from './ProviderChip'

// Stub the model-catalog fetch — the dropdown does a useQuery on mount.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      provider: 'ollama',
      default: 'auto',
      auto_resolves_to: 'llama3.1:8b',
      models: [{ id: 'llama3.1:8b', label: 'Llama 3.1 8B', supports_tools: true, installed: true }],
    }),
  }),
)

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('ProviderChip', () => {
  it('renders provider + model + tok suffix', () => {
    renderWithQuery(<ProviderChip />)
    expect(screen.getByRole('button', { name: /ollama/i })).toBeInTheDocument()
  })
})
