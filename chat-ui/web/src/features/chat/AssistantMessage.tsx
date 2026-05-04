import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  content: string
  status?: string
  provider?: string
  model?: string
}

export function AssistantMessage({ content, status, provider, model }: Props) {
  // Show the model tag only on settled assistant messages. Not on pending
  // bubbles (we don't yet know what answered) and not on user-side stuff.
  // Tag is rendered ABOVE the bubble so when a user copy-pastes a chat
  // transcript, the model name visually associates with the response that
  // follows it (not the user prompt that comes after the response).
  const showTag = status === 'ok' && (model || provider)
  return (
    <div className="self-start max-w-[90%] flex flex-col gap-1">
      {showTag && (
        <div
          className="self-start text-[10px] text-faint font-mono px-1.5 py-0.5 rounded border border-border bg-bg"
          title={provider ? `Provider: ${provider}` : undefined}
          data-testid="assistant-model-tag"
        >
          {model || provider}
        </div>
      )}
      <div className="bg-surface-2 border border-border rounded-[10px] px-3 py-2 text-base prose prose-sm dark:prose-invert prose-code:bg-bg prose-code:border prose-code:border-border prose-code:rounded prose-code:px-1 prose-code:font-mono">
        {status === 'pending' ? (
          <span className="text-muted italic">…</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}
