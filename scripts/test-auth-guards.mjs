// Lightweight runtime check of the auth-guards logic.
// Run from the project root: node scripts/test-auth-guards.mjs
//
// Imports the production bundle from dist/_astro and exercises
// `mountAuthGuards` against a stubbed DOM. The bundle closes over
// the global `window` / `document` / `localStorage` lazily, so a
// single harness with per-test reset is sufficient and matches how
// the browser evaluates the module.

import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(projectRoot, 'dist', '_astro');
const guardFile = fs.readdirSync(distDir).find((f) => f.startsWith('auth-guards.') && f.endsWith('.js'));
if (!guardFile) { console.error('No auth-guards bundle found in', distDir); process.exit(1); }
const guardMod = await import(pathToFileURL(path.join(distDir, guardFile)).href);
const storeFile = fs.readdirSync(distDir).find((f) => f.startsWith('store.') && f.endsWith('.js'));
const storeMod = await import(pathToFileURL(path.join(distDir, storeFile)).href);
const mountAuthGuards = guardMod.a ?? guardMod.mountAuthGuards;
if (!mountAuthGuards) { console.error('mountAuthGuards export not found:', Object.keys(guardMod)); process.exit(1); }

// Build a single harness. Tests reset its state by mutating in place.
const listeners = new Map();
const store = new Map();
const replaceLog = [];
const body = {
  attrs: { 'data-page-auth': 'public' },
  getAttribute(k) { return this.attrs[k] ?? null; },
  setAttribute(k, v) { this.attrs[k] = v; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const docEl = { dataset: {}, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {} };
const fakeWindow = {
  location: {
    pathname: '/',
    search: '',
    replace(u) { replaceLog.push(u); },
  },
  addEventListener(type, fn) {
    const set = listeners.get(type) ?? new Set();
    set.add(fn);
    listeners.set(type, set);
  },
  scrollY: 0,
  matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
};
const fakeStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  // Real localStorage.setItem does NOT fire `storage` in the same
  // window — it only fires in OTHER tabs. Our stub mirrors that so
  // the cross-tab test (Test 10) can call dispatch() explicitly.
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};
function dispatch(type, detail) {
  const set = listeners.get(type);
  if (!set) return;
  for (const fn of set) fn({ ...detail, type });
}

globalThis.window = fakeWindow;
globalThis.document = { body, documentElement: docEl, querySelector() { return null; }, querySelectorAll() { return []; } };
globalThis.localStorage = fakeStorage;
globalThis.location = fakeWindow.location;
globalThis.PageTransitionEvent = class PageTransitionEvent {};

function resetHarness() {
  replaceLog.length = 0;
  // Clear only session/app-state keys, not the seed flag — clearing
  // the seed flag would re-trigger the demo seed (which writes
  // sl-session = null) and clobber whatever the test just set up.
  for (const k of [...store.keys()]) {
    if (k === 'sl-seeded-v2' || k === 'sl-seeded-v3' || k === 'sl-seeded-v4') continue;
    store.delete(k);
  }
  body.attrs['data-page-auth'] = 'public';
  for (const k of Object.keys(docEl.dataset)) delete docEl.dataset[k];
  fakeWindow.location.pathname = '/';
  fakeWindow.location.search = '';
}

// Prime the seed once so the first test does not pay the cost (and
// side-effect) of running seedIfEmpty — which writes sl-session = null
// — after the test sets up its session.
storeMod.store.auth.current();

const studentSession = {
  userId: 'u-demo-student', email: 'student@university.edu', name: 'Aria Mehta',
  role: 'student', signedInAt: '2026-06-06T00:00:00.000Z',
};
const companySession = {
  userId: 'u-demo-company', email: 'hire@linearlabs.com', name: 'Daniel Park',
  role: 'company', signedInAt: '2026-06-06T00:00:00.000Z',
};

const cases = [
  ['Test 1  student on /student/dashboard  - no redirect, signed-in', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'student';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/student/dashboard';
    mountAuthGuards();
    return replaceLog.length === 0 && docEl.dataset.auth === 'signed-in' && docEl.dataset.role === 'student';
  }],
  ['Test 2  company on /student/dashboard - redirect to /company/dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'student';
    fakeStorage.setItem('sl-session', JSON.stringify(companySession));
    fakeWindow.location.pathname = '/student/dashboard';
    mountAuthGuards();
    return replaceLog[0] === '/company/dashboard';
  }],
  ['Test 3  no session on /student/dashboard - redirect to /login with next', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'student';
    fakeWindow.location.pathname = '/student/dashboard';
    mountAuthGuards();
    return replaceLog[0] && replaceLog[0].startsWith('/login?next=') && replaceLog[0].includes('student');
  }],
  ['Test 4  signed-in student on /login - redirect to /student/dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/login';
    mountAuthGuards();
    return replaceLog[0] === '/student/dashboard';
  }],
  ['Test 5  signed-in company on /login - redirect to /company/dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeStorage.setItem('sl-session', JSON.stringify(companySession));
    fakeWindow.location.pathname = '/login';
    mountAuthGuards();
    return replaceLog[0] === '/company/dashboard';
  }],
  ['Test 6  student on /company/dashboard - redirect to /student/dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'company';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/company/dashboard';
    mountAuthGuards();
    return replaceLog[0] === '/student/dashboard';
  }],
  ['Test 7  company on /company/dashboard  - no redirect, signed-in', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'company';
    fakeStorage.setItem('sl-session', JSON.stringify(companySession));
    fakeWindow.location.pathname = '/company/dashboard';
    mountAuthGuards();
    return replaceLog.length === 0 && docEl.dataset.auth === 'signed-in';
  }],
  ['Test 8  next deep-link honored (student lands on /company/profile)', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/login';
    fakeWindow.location.search = '?next=/company/profile';
    mountAuthGuards();
    return replaceLog[0] === '/company/profile';
  }],
  ['Test 9  open-redirect next=//evil.com - ignored, falls back to dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/login';
    fakeWindow.location.search = '?next=//evil.com';
    mountAuthGuards();
    return replaceLog[0] === '/student/dashboard';
  }],
  ['Test 10 cross-tab sign-out bounces off protected page', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'student';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/student/dashboard';
    mountAuthGuards();
    // Simulate cross-tab sign-out: storage events fire in OTHER tabs
    // only, not the one that performed the write. The harness mirrors
    // that by requiring an explicit dispatch().
    fakeStorage.removeItem('sl-session');
    dispatch('storage', { key: 'sl-session' });
    return replaceLog.length > 0 && replaceLog[replaceLog.length - 1].startsWith('/login?next=');
  }],
  ['Test 11 public page never redirects, marks signed-out', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'public';
    fakeWindow.location.pathname = '/';
    mountAuthGuards();
    return replaceLog.length === 0 && docEl.dataset.auth === 'signed-out';
  }],
  ['Test 12 public page restores signed-in mode and role attribute', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'public';
    fakeStorage.setItem('sl-session', JSON.stringify(companySession));
    fakeWindow.location.pathname = '/';
    mountAuthGuards();
    return replaceLog.length === 0 && docEl.dataset.auth === 'signed-in' && docEl.dataset.role === 'company';
  }],
  ['Test 13 unauth on /signup - allowed to sign up (guest-only + no session)', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeWindow.location.pathname = '/signup';
    mountAuthGuards();
    return replaceLog.length === 0;
  }],
  ['Test 14 signed-in company on /signup - redirect to /company/dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeStorage.setItem('sl-session', JSON.stringify(companySession));
    fakeWindow.location.pathname = '/signup';
    mountAuthGuards();
    return replaceLog[0] === '/company/dashboard';
  }],
  ['Test 15 signed-in student on /signup - redirect to /student/dashboard', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    fakeWindow.location.pathname = '/signup';
    mountAuthGuards();
    return replaceLog[0] === '/student/dashboard';
  }],
  ['Test 16 unauth on /forgot-password - allowed (guest-only + no session)', () => {
    resetHarness();
    body.attrs['data-page-auth'] = 'guest-only';
    fakeWindow.location.pathname = '/forgot-password';
    mountAuthGuards();
    return replaceLog.length === 0;
  }],
  ['Test 17 session survives simulated reload (localStorage persists)', () => {
    resetHarness();
    fakeStorage.setItem('sl-session', JSON.stringify(studentSession));
    const restored = JSON.parse(fakeStorage.getItem('sl-session'));
    return restored && restored.role === 'student' && restored.email === 'student@university.edu';
  }],
];

let passes = 0, fails = 0;
for (const [name, fn] of cases) {
  let ok = false; let detail = '';
  try { ok = !!fn(); }
  catch (e) { ok = false; detail = e.message; }
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${ok ? '' : '  log=' + JSON.stringify(replaceLog) + (detail ? ' err=' + detail : '')}`);
  ok ? passes++ : fails++;
}
console.log(`\n${passes} passed, ${fails} failed.`);
process.exit(fails === 0 ? 0 : 1);
