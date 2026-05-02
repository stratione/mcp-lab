import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function AssistantMessage({ content, status }: { content: string; status?: string }) {
  return (
    <div className="self-start max-w-[90%] bg-surface-2 border border-border rounded-[10px] px-3 py-2 text-base prose prose-sm dark:prose-invert prose-code:bg-bg prose-code:border prose-code:border-border prose-code:rounded prose-code:px-1 prose-code:font-mono">
      {status === 'pending' ? (
        <span className="text-muted italic">…</span>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      )}
    </div>
  )
}
