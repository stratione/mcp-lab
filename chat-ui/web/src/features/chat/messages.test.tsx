import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolCallSummary } from './ToolCallSummary'

describe('messages', () => {
  it('renders user content', () => {
    render(<UserMessage content="hello" />)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('renders assistant markdown', () => {
    render(<AssistantMessage content="**bold**" />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('expands/collapses tool calls', async () => {
    render(<ToolCallSummary call={{ name: 'list_users', arguments: {}, result: '[]' }} />)
    expect(screen.queryByText(/arguments/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/arguments/i)).toBeInTheDocument()
  })
})
