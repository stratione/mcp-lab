import { MessageList } from '@/features/chat/MessageList'

export function ChatPane() {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <MessageList />
    </div>
  )
}
