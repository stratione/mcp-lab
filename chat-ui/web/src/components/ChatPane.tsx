import { MessageList } from '@/features/chat/MessageList'
import { FlyingBlindBanner } from '@/components/FlyingBlindBanner'

export function ChatPane() {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <FlyingBlindBanner />
      <MessageList />
    </div>
  )
}
