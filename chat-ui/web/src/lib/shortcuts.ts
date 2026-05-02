import { useEffect } from 'react'
import { useLab } from './store'
import { applyTheme, applyDensity, type Density } from './theme'
import { setHallucinationMode } from './api'

const STEPS: Density[] = ['compact', 'comfortable', 'large']

function bump(direction: 1 | -1) {
  const cur = (document.documentElement.dataset.density as Density) || 'comfortable'
  const idx = STEPS.indexOf(cur)
  const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx + direction))]
  const scale = next === 'compact' ? 0.85 : next === 'large' ? 1.18 : 1
  applyDensity(next, scale)
}

export function useShortcuts() {
  const clear = useLab((s) => s.clearMessages)
  const setFlying = useLab((s) => s.setFlyingBlind)
  const flying = useLab((s) => s.flyingBlind)
  const setShortcutsOpen = useLab((s) => s.setShortcutsOpen)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
        applyTheme(cur === 'dark' ? 'light' : 'dark')
        return
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        const next = !flying
        setFlying(next)
        setHallucinationMode(next).catch(() => {})
        return
      }
      if (meta && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        bump(+1)
        return
      }
      if (meta && e.key === '-') {
        e.preventDefault()
        bump(-1)
        return
      }
      if (meta && e.key === '0') {
        e.preventDefault()
        applyDensity('comfortable', 1)
        return
      }
      if (meta && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault()
        clear()
        return
      }
      if (
        e.key === '?' &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear, setFlying, flying, setShortcutsOpen])
}
