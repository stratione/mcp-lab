import { describe, it, expect, beforeEach } from 'vitest'
import { useLab } from './store'

describe('useLab store', () => {
  beforeEach(() => {
    useLab.setState(useLab.getInitialState(), true)
  })

  it('appends user messages', () => {
    useLab.getState().appendMessage({ id: '1', role: 'user', content: 'hi' })
    expect(useLab.getState().messages).toHaveLength(1)
  })

  it('clears messages', () => {
    useLab.getState().appendMessage({ id: '1', role: 'user', content: 'hi' })
    useLab.getState().clearMessages()
    expect(useLab.getState().messages).toHaveLength(0)
  })

  it('toggles inspector tab', () => {
    useLab.getState().setInspectorTab('tools')
    expect(useLab.getState().inspectorTab).toBe('tools')
  })

  it('tracks streaming abort controller', () => {
    const ac = new AbortController()
    useLab.getState().setAbort(ac)
    expect(useLab.getState().abort).toBe(ac)
  })

  it('tracks session token total', () => {
    useLab.getState().addTokens(100)
    useLab.getState().addTokens(50)
    expect(useLab.getState().sessionTokens).toBe(150)
  })

  it('toggles workshop mode', () => {
    expect(useLab.getState().workshopMode).toBe(false)
    useLab.getState().setWorkshopMode(true)
    expect(useLab.getState().workshopMode).toBe(true)
  })

  it('tracks workshop step', () => {
    useLab.getState().setWorkshopStep(3)
    expect(useLab.getState().workshopStep).toBe(3)
  })

  it('sets and clears pendingPrompt', () => {
    useLab.getState().setPendingPrompt('List all users.')
    expect(useLab.getState().pendingPrompt).toBe('List all users.')
    useLab.getState().setPendingPrompt(null)
    expect(useLab.getState().pendingPrompt).toBeNull()
  })
})
