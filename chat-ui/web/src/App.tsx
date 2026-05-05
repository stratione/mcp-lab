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
import { useServers } from '@/features/servers/useServers'
import { setHallucinationMode } from '@/lib/api'

export default function App() {
  useShortcuts()
  const setInspectorTab = useLab((s) => s.setInspectorTab)
  const flyingBlind = useLab((s) => s.flyingBlind)
  const setFlyingBlind = useLab((s) => s.setFlyingBlind)
  const { data: servers } = useServers()

  // workshop launcher: opening /?dashboard=open switches inspector to compare tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('dashboard') === 'open') {
      setInspectorTab('compare')
    }
  }, [setInspectorTab])

  // Flying Blind starts ON so the first impression is the model fabricating.
  // The intended arc is "watch it lie → enable an MCP → see the difference",
  // so as soon as any MCP comes online we clear the flag (and tell the
  // server) automatically. Manual re-enable via the corner menu still works
  // for replays.
  useEffect(() => {
    if (!flyingBlind || !servers) return
    const anyOnline = servers.some((s) => s.status === 'online')
    if (anyOnline) {
      setFlyingBlind(false)
      void setHallucinationMode(false)
    }
  }, [flyingBlind, servers, setFlyingBlind])

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
