/**
 * session-bar
 *
 * Lightweight global script that reads the current session from
 * `store.auth` and rewires any [data-session-aware] nav on the page
 * to reflect signed-in state:
 *
 *   - Replace generic "Sign up" / "Log in" CTAs with the user's first
 *     name and a "Log out" button.
 *   - Wire the dashboard avatar button to a small dropdown that
 *     includes a "Log out" item.
 *
 * The module is idempotent — calling mountSessionBar() multiple times
 * is safe.
 */

import { store } from './store';
import { toast } from './toast';
import { getBrowserSupabase } from '../lib/supabase-browser';
import { SESSION_STORAGE_KEY, type AppSession } from '../lib/types';

/**
 * Read the active session. Prefers the mirror localStorage entry the
 * middleware writes; falls back to the legacy mock store so the rest
 * of the UI keeps working.
 */
function readSession(): AppSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppSession;
  } catch {
    // ignore
  }
  return store.auth.current();
}

async function signOut() {
  const name = readSession()?.name;
  // Clear the local mirror first so other tabs / the next paint
  // don't see a logged-in user.
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('sl-session');
  } catch {
    // ignore
  }
  // Best-effort: tell Supabase to revoke the session. If the request
  // fails (offline, expired token) we still redirect — the server
  // will drop the cookie on the next request.
  try {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(
      'sl-toast-once',
      JSON.stringify({
        variant: 'info',
        title: name ? `Signed out — see you soon, ${name.split(' ')[0]}` : 'Signed out',
      }),
    );
  } catch {
    // ignore
  }
  // Hard navigation so middleware re-runs and the page renders for
  // the signed-out user.
  window.location.replace('/auth/signout');
}

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  );
}

function replaceNavCta(scope: ParentNode = document) {
  const hosts = scope.querySelectorAll<HTMLElement>('[data-session-aware]');
  hosts.forEach((host) => {
    const session = readSession();
    if (!session) return;
    const signedInHref =
      session.role === 'company' ? '/company/dashboard' : '/student/find-work';
    host.innerHTML = `
      <a class="ds-nav-user" href="${signedInHref}" aria-label="Go to your dashboard">
        <span class="ds-nav-user__avatar" aria-hidden="true">${initials(session.name)}</span>
        <span class="ds-nav-user__name">${session.name.split(' ')[0]}</span>
      </a>
      <button type="button" class="ds-btn ds-btn--primary-sm ds-btn--size-md" data-logout>
        Log out
      </button>
    `;
    const logout = host.querySelector<HTMLButtonElement>('[data-logout]');
    logout?.addEventListener('click', (e) => {
      e.preventDefault();
      void signOut();
    });
  });
}

function attachAvatarMenu() {
  const btn = document.querySelector<HTMLButtonElement>('[data-avatar]');
  if (!btn) return;

  // Wrap the existing button so we can absolutely-position a menu
  // without disturbing the parent layout.
  const wrap = document.createElement('div');
  wrap.className = 'ds-avatar-menu';
  btn.parentNode?.insertBefore(wrap, btn);
  wrap.appendChild(btn);

  const menu = document.createElement('div');
  menu.className = 'ds-avatar-menu__pop';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  wrap.appendChild(menu);

  const refreshMenu = () => {
    const s = readSession();
    if (!s) {
      menu.innerHTML = `
        <a href="/login" role="menuitem">Log in</a>
        <a href="/signup" role="menuitem">Create an account</a>
      `;
      return;
    }
    const dest = s.role === 'company' ? '/company/dashboard' : '/student/dashboard';
    const profileHref = s.role === 'company' ? '/company/profile' : '/student/profile';
    const settingsHref = s.role === 'company' ? '/company/settings' : '/student/settings';
    const roleLabel = s.role === 'company' ? 'Company' : 'Student';
    menu.innerHTML = `
      <div class="ds-avatar-menu__head">
        <div class="ds-avatar-menu__user">
          <span class="ds-avatar-menu__avatar">${initials(s.name)}</span>
          <div class="ds-avatar-menu__info">
            <strong>${s.name}</strong>
            <span class="ds-avatar-menu__role">${roleLabel}</span>
          </div>
        </div>
        <span class="ds-avatar-menu__email">${s.email}</span>
      </div>
      <hr />
      <a href="${profileHref}" role="menuitem">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 13c.5-2.4 2.6-4 5-4s4.5 1.6 5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        My Profile
      </a>
      <a href="${dest}" role="menuitem">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 7l6-5 6 5v6.5a.5.5 0 0 1-.5.5h-3v-4h-5v4h-3a.5.5 0 0 1-.5-.5V7Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        Dashboard
      </a>
      <a href="${settingsHref}" role="menuitem">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        Settings
      </a>
      <a href="#" role="menuitem" class="ds-avatar-menu__notif-link">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 5.5a4 4 0 1 0-8 0c0 4.5-2 5.8-2 5.8h12s-2-1.3-2-5.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.1 13.7a1.2 1.2 0 0 1-2.2 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Notifications
        <span class="ds-avatar-menu__badge">3</span>
      </a>
      <hr />
      <button type="button" role="menuitem" data-logout>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2h-3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M6 8h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Log out
      </button>
    `;
    menu
      .querySelector<HTMLButtonElement>('[data-logout]')
      ?.addEventListener('click', (e) => {
        e.preventDefault();
        void signOut();
      });
  };
  refreshMenu();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

export { signOut };

export function mountSessionBar() {
  replaceNavCta();
  attachAvatarMenu();
  // Surface any pending one-shot toast handed off from another page
  // (e.g. "Signed out" after a logout). Read once and clear.
  try {
    const raw = sessionStorage.getItem('sl-toast-once');
    if (raw) {
      sessionStorage.removeItem('sl-toast-once');
      const payload = JSON.parse(raw) as { variant?: 'info' | 'success' | 'error'; title: string; message?: string };
      if (payload && payload.title) {
        toast.show({
          variant: payload.variant ?? 'info',
          title: payload.title,
          message: payload.message,
        });
      }
    }
  } catch {
    // ignore
  }
}
