// Theme preference. Three states, matching how the CSS is structured:
//   'system' — no data-theme stamp; prefers-color-scheme decides (the default)
//   'light'  — data-theme="light", beats a dark OS
//   'dark'   — data-theme="dark",  beats a light OS
const KEY = 'oem_theme_v1';
export const THEMES = ['system', 'light', 'dark'];

export function loadTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
}

// Apply before React mounts so the first paint is already in the right theme
// (otherwise a dark-mode user gets a white flash on every load).
export function initTheme() {
  applyTheme(loadTheme());
}
