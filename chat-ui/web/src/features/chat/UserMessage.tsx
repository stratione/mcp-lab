export function UserMessage({ content }: { content: string }) {
  return (
    <div className="self-end max-w-[75%] bg-primary text-primary-fg rounded-[10px] px-3 py-2 text-base whitespace-pre-wrap break-words">
      {content}
    </div>
  )
}
