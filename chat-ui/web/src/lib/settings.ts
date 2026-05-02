export type Settings = {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}

const KEY = 'mcp-lab.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { provider: 'ollama', model: 'llama3.1', apiKey: '', ...JSON.parse(raw) }
  } catch {}
  return { provider: 'ollama', model: 'llama3.1', apiKey: '' }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
