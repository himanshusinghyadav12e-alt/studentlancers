/**
 * theme-toggle
 *
 * Wires every [data-theme-toggle] button on the page to flip the
 * document's data-theme between "light" and "dark", persisting the
 * choice in localStorage. Mirrors OS preference changes when the user
 * hasn't explicitly chosen.
 *
 * The no-flash theme attribute is set in ThemeBoot.astro's inline head
 * script before paint. This module only handles interactive toggling.
 */

const STORAGE_KEY = 'sl-theme';

function currentTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(next: 'light' | 'dark', persist: boolean) {
  document.documentElement.setAttribute('data-theme', next);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable; ignore
    }
  }
  // Sync aria-pressed on every toggle button on the page.
  const isDark = next === 'dark';
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      isDark ? 'Switch to light mode' : 'Switch to dark mode',
    );
  });
}

function attach() {
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  });
  // Reflect the current theme in aria-pressed on first paint
  applyTheme(currentTheme(), false);
}

function watchOsPreference() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event: MediaQueryListEvent) => {
    // Only auto-switch when the user has not explicitly chosen.
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // ignore
    }
    applyTheme(event.matches ? 'dark' : 'light', false);
  };
  if ('addEventListener' in mq) mq.addEventListener('change', handler);
  else if ('addListener' in mq) (mq as unknown as { addListener: (h: typeof handler) => void }).addListener(handler);
}

export function mountThemeToggle() {
  attach();
  watchOsPreference();
}
