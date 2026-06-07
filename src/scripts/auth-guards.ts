/**
 * auth-guards
 *
 * Client-side session restoration and route guarding for the static
 * Astro build. The auth store lives in localStorage, so server-rendered
 * pages always see "no session" and would otherwise render a blank
 * dashboard for a logged-in user. This module is the single point
 * that:
 *
 *   1. Restores the session into a global `data-auth` attribute on
 *      <html> so every page (and CSS) can react to it.
 *   2. Redirects unauthenticated users away from protected pages.
 *   3. Redirects already-authenticated users away from /login and
 *      /signup to their role's dashboard (or to a `?next=` target).
 *   4. Redirects role-mismatched users to the correct dashboard.
 *
 * Pages opt in by setting a `data-page-auth` attribute on <body> with
 * one of:
 *
 *   - "public"     — never redirect (homepage, marketing, info pages)
 *   - "guest-only" — only allow if NOT signed in; redirect signed-in
 *                    users to their dashboard (login, signup, forgot)
 *   - "student"    — requires an authenticated student; sends
 *                    companies to /company/dashboard and unauth users
 *                    to /login?next=<this-path>
 *   - "company"    — requires an authenticated company; sends students
 *                    to /student/dashboard and unauth users to
 *                    /login?next=<this-path>
 *
 * The module also re-runs on `pageshow` (with persisted=true) and on
 * `storage` (cross-tab sign-out) so a manual sign-out in one tab
 * does not leave the other tab stuck on a dashboard.
 */

import { store, type Role } from './store';

type AuthMode = 'public' | 'guest-only' | 'student' | 'company';

const ROLE_DASHBOARD: Record<Role, string> = {
  student: '/student/dashboard',
  company: '/company/dashboard',
};

function currentPath(): string {
  return window.location.pathname || '/';
}

function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  // Only allow same-origin, absolute-path redirects. Drop protocol-
  // relative or external URLs to prevent open-redirects.
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function loginFor(next: string): string {
  const params = new URLSearchParams();
  params.set('next', next);
  return '/login?' + params.toString();
}

/**
 * Apply the session to the document. Pages and CSS can read
 * `document.documentElement.dataset.auth` to adapt without waiting
 * for a redirect to finish.
 */
function applyDocumentMode(session: ReturnType<typeof store.auth.current>) {
  const root = document.documentElement;
  if (session) {
    root.dataset.auth = 'signed-in';
    root.dataset.role = session.role;
  } else {
    root.dataset.auth = 'signed-out';
    delete root.dataset.role;
  }
}

/**
 * Decide whether the current page is allowed for `session`. Returns
 * either a no-op (`ok: true`) or a target URL to redirect to.
 */
function routeDecision(
  mode: AuthMode,
  session: ReturnType<typeof store.auth.current>,
): { ok: true } | { ok: false; redirectTo: string } {
  const path = currentPath();

  if (mode === 'public') return { ok: true };

  if (mode === 'guest-only') {
    if (session) {
      // If the URL has a safe ?next=, prefer it (so e.g. "Already have
      // an account? Log in" on a deep-linked page can still go back).
      // Don't bounce to another auth page — that would re-trigger
      // guest-only and loop the user back here.
      const params = new URLSearchParams(window.location.search);
      const next = safeNext(params.get('next'));
      const isAuthPage =
        next === '/login' ||
        next === '/signup' ||
        next === '/forgot-password';
      return {
        ok: false,
        redirectTo: next && !isAuthPage ? next : ROLE_DASHBOARD[session.role],
      };
    }
    return { ok: true };
  }

  // Protected mode (student or company).
  if (!session) {
    return { ok: false, redirectTo: loginFor(path) };
  }
  if (mode === session.role) return { ok: true };
  // Role mismatch — send to the right dashboard. The user is
  // authenticated, so a 401-style redirect to /login is wrong.
  return { ok: false, redirectTo: ROLE_DASHBOARD[session.role] };
}

/**
 * Run the guard for the current page. Reads the mode from
 * <body data-page-auth="…"> and applies the matching decision. Safe
 * to call multiple times — the decision is idempotent.
 */
function runGuards(): void {
  const body = document.body;
  if (!body) return;
  const mode = (body.getAttribute('data-page-auth') as AuthMode | null) ?? 'public';
  const session = store.auth.current();
  applyDocumentMode(session);

  const decision = routeDecision(mode, session);
  if (!decision.ok) {
    // Use replace() so the back button doesn't trap the user on the
    // page they were just bounced from.
    window.location.replace(decision.redirectTo);
  }
}

/**
 * Mount entry point. Idempotent.
 */
export function mountAuthGuards(): void {
  runGuards();

  // Cross-tab sync: if the user signs out in tab A, tab B should
  // re-evaluate its guard (e.g. to redirect off a dashboard).
  window.addEventListener('storage', (event) => {
    if (event.key === 'sl-session') runGuards();
  });

  // Back/forward cache (Safari) restores pages with `persisted=true`.
  // Re-run guards on restore so a sign-out that happened in another
  // tab still bounces us to /login.
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) runGuards();
  });
}
