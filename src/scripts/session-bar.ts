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
    const session = store.auth.current();
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
    logout?.addEventListener('click', () => {
      store.auth.signOut();
      // replace() so the back button doesn't dump the user back on the
      // page they were just signed out of.
      window.location.replace('/');
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

  const session = store.auth.current();
  const dashboardHref = session
    ? session.role === 'company'
      ? '/company/dashboard'
      : '/student/find-work'
    : '/login';

  menu.innerHTML = `
    <a href="${dashboardHref}" role="menuitem">Dashboard</a>
    <a href="/student/find-work" role="menuitem">Find work</a>
    ${
      session?.role === 'company'
        ? '<a href="/jobs/post" role="menuitem">Post a brief</a>'
        : ''
    }
    <a href="/contact" role="menuitem">Help &amp; support</a>
    <hr />
    <button type="button" role="menuitem" data-logout>Log out</button>
  `;

  const refreshMenu = () => {
    const s = store.auth.current();
    if (!s) {
      menu.innerHTML = `
        <a href="/login" role="menuitem">Log in</a>
        <a href="/signup" role="menuitem">Create an account</a>
      `;
      return;
    }
    const dest = s.role === 'company' ? '/company/dashboard' : '/student/find-work';
    menu.innerHTML = `
      <div class="ds-avatar-menu__head">
        <strong>${s.name}</strong>
        <span>${s.email}</span>
      </div>
      <a href="${dest}" role="menuitem">Dashboard</a>
      <a href="/student/find-work" role="menuitem">Find work</a>
      ${
        s.role === 'company' ? '<a href="/jobs/post" role="menuitem">Post a brief</a>' : ''
      }
      <a href="/contact" role="menuitem">Help &amp; support</a>
      <hr />
      <button type="button" role="menuitem" data-logout>Log out</button>
    `;
    menu.querySelector<HTMLButtonElement>('[data-logout]')?.addEventListener('click', () => {
      store.auth.signOut();
      // replace() so the back button doesn't dump the user back on the
      // page they were just signed out of.
      window.location.replace('/');
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

export function mountSessionBar() {
  replaceNavCta();
  attachAvatarMenu();
}
