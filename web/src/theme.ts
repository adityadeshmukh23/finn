export type Theme = 'dark' | 'light'

/** The same key and colours as the inline script in index.html, which applies the theme before first paint. A test holds them together. */
export const THEME_KEY = 'finn.theme'
export const THEME_COLOR: Record<Theme, string> = { dark: '#0f1115', light: '#f6f5f2' }

/** Dark unless the reader chose light, whatever the phone's own setting. Remembered on this device only. */
export function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function saveTheme(t: Theme) {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* session-only */ }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t])
}
