import { useEffect } from 'react'
import { Header } from '@/components/Header'
import { ChatPane } from '@/components/ChatPane'
import { Inspector } from '@/components/Inspector'
import { InputRow } from '@/components/InputRow'
import { CmdK } from '@/components/CmdK'
import { useShortcuts } from '@/lib/shortcuts'
import { Shortcuts } from '@/components/Shortcuts'
import { Walkthrough } from '@/components/Walkthrough'
import { useLab } from '@/lib/store'

export default function App() {
  useShortcuts()
  const setInspectorTab = useLab((s) => s.setInspectorTab)

  // workshop launcher: opening /?dashboard=open switches inspector to compare tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('dashboard') === 'open') {
      setInspectorTab('compare')
    }
  }, [setInspectorTab])

  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <Header />
      <div className="flex-1 flex min-h-0">
        <ChatPane />
        <Inspector />
      </div>
      <InputRow />
      <CmdK />
      <Shortcuts />
      <Walkthrough />
    </div>
  )
}
