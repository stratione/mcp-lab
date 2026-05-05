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
    if (raw) {
      const merged = { provider: 'ollama', model: 'llama3.1', apiKey: '', ...JSON.parse(raw) }
      // Returning users may have the removed 'pretend' demo provider saved.
      // Reset to ollama so the dropdown selection stays valid.
      if (merged.provider === 'pretend') {
        merged.provider = 'ollama'
        merged.model = 'llama3.1'
      }
      return merged
    }
  } catch {}
  return { provider: 'ollama', model: 'llama3.1', apiKey: '' }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
