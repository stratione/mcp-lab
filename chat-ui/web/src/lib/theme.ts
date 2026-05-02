export type Theme = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable' | 'large'

const THEME_KEY = 'mcp-lab.theme'
const DENSITY_KEY = 'mcp-lab.density'
const SCALE_KEY = 'mcp-lab.scale'

export function applyTheme(theme: Theme) {
  const resolved =
    theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  localStorage.setItem(THEME_KEY, theme)
}

export function applyDensity(d: Density, scale?: number) {
  document.documentElement.dataset.density = d
  if (typeof scale === 'number') {
    document.documentElement.style.setProperty('--ui-scale', String(scale))
    localStorage.setItem(SCALE_KEY, String(scale))
  } else {
    document.documentElement.style.removeProperty('--ui-scale')
    localStorage.removeItem(SCALE_KEY)
  }
  localStorage.setItem(DENSITY_KEY, d)
}

export function bootstrapTheme() {
  const t = (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
  const d = (localStorage.getItem(DENSITY_KEY) as Density) || 'comfortable'
  const s = localStorage.getItem(SCALE_KEY)
  applyTheme(t)
  applyDensity(d, s ? Number(s) : undefined)
}
