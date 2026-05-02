import { Header } from '@/components/Header'
import { ChatPane } from '@/components/ChatPane'
import { Inspector } from '@/components/Inspector'
import { InputRow } from '@/components/InputRow'

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <Header />
      <div className="flex-1 flex min-h-0">
        <ChatPane />
        <Inspector />
      </div>
      <InputRow />
    </div>
  )
}
