/**
 * store
 *
 * Tiny localStorage-backed "API" for the StudentLancers demo. Acts as the
 * single source of truth for auth, briefs, and applications so the rest
 * of the UI can pretend there is a real backend.
 *
 * What lives in localStorage:
 *   - `sl-users`        — array of registered accounts. Company
 *     users carry an optional `companyProfile` (website, logoUrl,
 *     blurb) edited from /company/profile.
 *   - `sl-session`      — the currently signed-in user, or null
 *   - `sl-briefs`       — user-posted briefs (seeded with a few examples)
 *   - `sl-applications` — submitted applications
 *
 * Demo accounts (seeded on first load):
 *   - student@university.edu / student123  (Student, Aria M.)
 *   - hire@linearlabs.com   / company123   (Company, Linear Labs)
 *
 * The module exposes a top-level `store` object with namespaced APIs.
 * It is safe to import on pages without rendering anything; nothing
 * touches the DOM at import time.
 */

export type Role = 'student' | 'company';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Plaintext in the mock; replace with hashed password in a real backend. */
  password: string;
  createdAt: string;
  /**
   * Optional company-side profile. Only populated for role: 'company'.
   * The store keeps the type optional so student users don't carry
   * empty fields. URL / length validation lives in the form layer;
   * the store just persists the strings as written.
   */
  companyProfile?: CompanyProfile;
}

/**
 * Public-facing company profile. All fields are optional — a company
 * with no profile is not an error, it just renders placeholders.
 */
export interface CompanyProfile {
  website?: string;
  logoUrl?: string;
  blurb?: string;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: Role;
  signedInAt: string;
}

export interface Brief {
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  budgetType: 'fixed' | 'hourly';
  budget: number;
  duration: string;
  hours: string;
  skills: string[];
  links: string;
  /** Owning company (the user who posted it) */
  ownerId: string;
  ownerName: string;
  createdAt: string;
}

export interface Application {
  id: string;
  briefId: string;
  briefTitle: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  cover: string;
  rate: number;
  timeline: string;
  portfolio: string;
  createdAt: string;
  /**
   * Company-side review state. Defaults to 'new'. The store never
   * mutates an application without an explicit write — reads always
   * reflect what was last persisted.
   */
  status: ApplicationStatus;
  /**
   * ISO timestamp of when the company clicked Hire. Only present on
   * rows with status === 'hired'. Backfilled from `createdAt` for
   * 'hired' rows written by older builds so the hires list can show
   * a sensible date.
   */
  hiredAt?: string;
}

export type ApplicationStatus = 'new' | 'shortlisted' | 'hired' | 'rejected';

const USERS_KEY = 'sl-users';
const SESSION_KEY = 'sl-session';
const BRIEFS_KEY = 'sl-briefs';
const APPS_KEY = 'sl-applications';
/**
 * Seed sentinel. Each version corresponds to a one-time migration:
 *   v2 → introduced Application.status; backfilled 'new' on rows
 *        written by older builds.
 *   v3 → introduces the optional CompanyProfile on User. No backfill
 *        is needed (the field is optional); only the seeded demo
 *        company gets a baseline profile so the editor has something
 *        to render on first run.
 *   v4 → introduces Application.hiredAt. Backfills the timestamp on
 *        any existing 'hired' row from its `createdAt` so the
 *        /company/hires list can show when each engagement started.
 */
const SEED_FLAG_KEY = 'sl-seeded-v4';
const SEED_FLAG_V2 = 'sl-seeded-v2';
const SEED_FLAG_V3 = 'sl-seeded-v3';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable; best-effort, swallow.
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function shortId(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function seedIfEmpty(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG_KEY)) return;

  const seedUsers: User[] = [
    {
      id: 'u-demo-student',
      email: 'student@university.edu',
      name: 'Aria Mehta',
      role: 'student',
      password: 'student123',
      createdAt: '2026-05-20T10:00:00.000Z',
    },
    {
      id: 'u-demo-company',
      email: 'hire@linearlabs.com',
      name: 'Daniel Park',
      role: 'company',
      password: 'company123',
      createdAt: '2026-05-15T09:00:00.000Z',
      // Baseline profile for the demo company. The editor lets the
      // user override any of these; the migration does not touch
      // existing profiles if they were edited on a prior build.
      companyProfile: {
        website: 'https://linearlabs.com',
        logoUrl: '',
        blurb:
          'Linear Labs is a five-person product studio building internal tools for B2B SaaS. We hire one or two students per quarter for short, paid engagements.',
      },
    },
  ];
  write(USERS_KEY, seedUsers);
  write(SESSION_KEY, null);
  write(BRIEFS_KEY, [] as Brief[]);
  write(APPS_KEY, [] as Application[]);
  try {
    // First-run users skip every prior migration (no old data to
    // backfill). The migration also promotes earlier sentinels
    // forward for users returning from a prior build.
    localStorage.setItem(SEED_FLAG_KEY, '4');
  } catch {
    // ignore
  }
}

function ensureSeeded(): void {
  seedIfEmpty();
  // Defensive: if a user wiped one of the keys, restore it to an empty
  // array so the rest of the module never crashes on undefined.
  if (read<User[] | null>(USERS_KEY, null) === null) write(USERS_KEY, [] as User[]);
  if (read<Brief[] | null>(BRIEFS_KEY, null) === null) write(BRIEFS_KEY, [] as Brief[]);
  if (read<Application[] | null>(APPS_KEY, null) === null) write(APPS_KEY, [] as Application[]);
  migrateV2();
  migrateV3();
  migrateV4();
}

/**
 * One-time backfill: every application written by an older build is
 * missing the `status` field. Default them to 'new' so the new UI
 * never has to special-case undefined.
 *
 * The previous v2 build gated this on SEED_FLAG_KEY; we now gate on
 * SEED_FLAG_V2 so v2 → v3 upgrades don't re-run an already-done
 * backfill. Idempotent: re-running is a no-op because every app
 * already has a status by then.
 */
function migrateV2(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG_V2)) return;
  const apps = read<Application[]>(APPS_KEY, []);
  if (apps.length === 0) {
    // No rows to backfill. Mark done so we never re-scan.
    try {
      localStorage.setItem(SEED_FLAG_V2, '1');
    } catch {
      // ignore
    }
    return;
  }
  let dirty = false;
  const next = apps.map((a) => {
    if (!a.status) {
      dirty = true;
      return { ...a, status: 'new' as ApplicationStatus };
    }
    return a;
  });
  if (dirty) write(APPS_KEY, next);
  try {
    localStorage.setItem(SEED_FLAG_V2, '1');
  } catch {
    // ignore
  }
}

/**
 * v3: CompanyProfile is optional, so existing users on v2 don't need
 * a data backfill. We just promote the v3 sentinel forward so future
 * reads can take the fast path.
 */
function migrateV3(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG_V3)) return;
  try {
    localStorage.setItem(SEED_FLAG_V3, '1');
  } catch {
    // ignore
  }
}

/**
 * v4: backfill Application.hiredAt. Every application that already
 * has status === 'hired' gets a hiredAt copied from its createdAt
 * (the best estimate we have). New hires will be written with the
 * real timestamp at the moment of the action.
 */
function migrateV4(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG_KEY)) return;
  const apps = read<Application[]>(APPS_KEY, []);
  if (apps.length > 0) {
    let dirty = false;
    const next = apps.map((a) => {
      if (a.status === 'hired' && !a.hiredAt) {
        dirty = true;
        return { ...a, hiredAt: a.createdAt };
      }
      return a;
    });
    if (dirty) write(APPS_KEY, next);
  }
  try {
    localStorage.setItem(SEED_FLAG_KEY, '4');
  } catch {
    // ignore
  }
}

/* ─── Auth ─────────────────────────────────────────────────────── */

export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; message: string };

function buildSession(user: User): Session {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    signedInAt: nowIso(),
  };
}

const auth = {
  current(): Session | null {
    if (typeof localStorage === 'undefined') return null;
    ensureSeeded();
    return read<Session | null>(SESSION_KEY, null);
  },

  signUp(input: {
    email: string;
    password: string;
    name: string;
    role: Role;
  }): AuthResult {
    ensureSeeded();
    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, message: 'Enter your email address.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: false, message: 'Enter a valid email address.' };
    if (!input.password || input.password.length < 8)
      return { ok: false, message: 'Password must be at least 8 characters.' };
    if (!input.name.trim() || input.name.trim().length < 2)
      return { ok: false, message: 'Enter your full name.' };

    const users = read<User[]>(USERS_KEY, []);
    if (users.some((u) => u.email === email))
      return { ok: false, message: 'An account with that email already exists. Try logging in.' };

    const user: User = {
      id: shortId('u'),
      email,
      name: input.name.trim(),
      role: input.role,
      password: input.password,
      createdAt: nowIso(),
    };
    users.push(user);
    write(USERS_KEY, users);

    const session = buildSession(user);
    write(SESSION_KEY, session);
    return { ok: true, session };
  },

  signIn(input: { email: string; password: string }): AuthResult {
    ensureSeeded();
    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, message: 'Enter your email address.' };
    if (!input.password) return { ok: false, message: 'Enter your password.' };

    const users = read<User[]>(USERS_KEY, []);
    const user = users.find((u) => u.email === email);
    if (!user) return { ok: false, message: 'No account with that email exists.' };
    if (user.password !== input.password)
      return { ok: false, message: 'That password is incorrect.' };

    const session = buildSession(user);
    write(SESSION_KEY, session);
    return { ok: true, session };
  },

  signOut(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  },

  /** Mock forgot-password: always succeeds if the email looks valid. */
  forgotPassword(input: { email: string }): { ok: true; email: string } | { ok: false; message: string } {
    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, message: 'Enter your email address.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: false, message: 'Enter a valid email address.' };
    return { ok: true, email };
  },
};

/* ─── Briefs ───────────────────────────────────────────────────── */

const briefs = {
  list(): Brief[] {
    ensureSeeded();
    return read<Brief[]>(BRIEFS_KEY, []);
  },

  listByOwner(ownerId: string): Brief[] {
    return briefs.list().filter((b) => b.ownerId === ownerId);
  },

  create(input: Omit<Brief, 'id' | 'createdAt'>): Brief {
    ensureSeeded();
    const list = read<Brief[]>(BRIEFS_KEY, []);
    const brief: Brief = {
      ...input,
      id: shortId('BR'),
      createdAt: nowIso(),
    };
    list.unshift(brief);
    write(BRIEFS_KEY, list);
    return brief;
  },
};

/* ─── Applications ────────────────────────────────────────────── */

const applications = {
  list(): Application[] {
    ensureSeeded();
    return read<Application[]>(APPS_KEY, []);
  },

  listByApplicant(applicantId: string): Application[] {
    return applications.list().filter((a) => a.applicantId === applicantId);
  },

  listByBrief(briefId: string): Application[] {
    return applications.list().filter((a) => a.briefId === briefId);
  },

  /**
   * Every application across every brief owned by `ownerId`. Used by
   * the company applicants inbox so it does not have to reach into
   * briefs itself.
   */
  listByOwner(ownerId: string): Application[] {
    // Avoid an import cycle: pull the brief-ownership check inline.
    // Briefs read is cheap (one localStorage parse) and avoids a
    // forward reference to the `briefs` namespace.
    const briefsRaw = read<Brief[]>(BRIEFS_KEY, []);
    const ownedIds = new Set(briefsRaw.filter((b) => b.ownerId === ownerId).map((b) => b.id));
    return applications.list().filter((a) => ownedIds.has(a.briefId));
  },

  create(input: Omit<Application, 'id' | 'createdAt' | 'status'>): Application {
    ensureSeeded();
    const list = read<Application[]>(APPS_KEY, []);
    const app: Application = {
      ...input,
      id: shortId('APP'),
      status: 'new',
      createdAt: nowIso(),
    };
    list.unshift(app);
    write(APPS_KEY, list);
    return app;
  },

  /**
   * Set a single application's review status. No-op (and returns the
   * current row) if the id is unknown — callers should not need to
   * guard against a stale id from a re-render.
   */
  updateStatus(id: string, status: ApplicationStatus): Application | null {
    ensureSeeded();
    const list = read<Application[]>(APPS_KEY, []);
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const updated: Application = { ...list[idx], status };
    list[idx] = updated;
    write(APPS_KEY, list);
    return updated;
  },

  /**
   * Hire one applicant on a brief; every other open application on
   * the same brief is auto-rejected (the brief can only be won by
   * one student). Returns both the hired application and the
   * auto-rejected ones so the UI can update the cards in one pass.
   */
  hire(
    id: string,
  ): { hired: Application | null; autoRejected: Application[] } {
    ensureSeeded();
    const list = read<Application[]>(APPS_KEY, []);
    const target = list.find((a) => a.id === id);
    if (!target) return { hired: null, autoRejected: [] };
    if (target.status === 'hired') {
      // Idempotent: calling hire() on an already-hired application is
      // a no-op. We still return it so the caller can render.
      return { hired: target, autoRejected: [] };
    }

    let hired: Application | null = null;
    const autoRejected: Application[] = [];
    const next = list.map((a) => {
      if (a.id === id) {
        const updated: Application = {
          ...a,
          status: 'hired',
          hiredAt: nowIso(),
        };
        hired = updated;
        return updated;
      }
      if (a.briefId === target.briefId && a.status !== 'rejected' && a.status !== 'hired') {
        const updated: Application = { ...a, status: 'rejected' };
        autoRejected.push(updated);
        return updated;
      }
      return a;
    });
    write(APPS_KEY, next);
    return { hired, autoRejected };
  },
};

/* ─── Companies ────────────────────────────────────────────────── */

const EMPTY_PROFILE: CompanyProfile = {};

const companies = {
  /**
   * Returns the profile attached to a user, or an empty object if
   * the user has no profile yet. Never returns null so callers do
   * not have to null-check the field.
   */
  getProfile(userId: string): CompanyProfile {
    ensureSeeded();
    const users = read<User[]>(USERS_KEY, []);
    const user = users.find((u) => u.id === userId);
    if (!user || !user.companyProfile) return { ...EMPTY_PROFILE };
    return { ...EMPTY_PROFILE, ...user.companyProfile };
  },

  /**
   * Shallow-merge a patch into the user's company profile and
   * persist. Returns the updated profile. Unknown user ids return
   * null so the editor can show a clear error.
   */
  updateProfile(
    userId: string,
    patch: Partial<CompanyProfile>,
  ): CompanyProfile | null {
    ensureSeeded();
    const users = read<User[]>(USERS_KEY, []);
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    const next: CompanyProfile = {
      ...EMPTY_PROFILE,
      ...users[idx].companyProfile,
      ...patch,
    };
    // Strip empty strings so an empty input is indistinguishable
    // from "never set" — the editor shows placeholders for both.
    const cleaned: CompanyProfile = {};
    if (next.website && next.website.trim()) cleaned.website = next.website.trim();
    if (next.logoUrl && next.logoUrl.trim()) cleaned.logoUrl = next.logoUrl.trim();
    if (next.blurb && next.blurb.trim()) cleaned.blurb = next.blurb.trim();
    users[idx] = { ...users[idx], companyProfile: cleaned };
    write(USERS_KEY, users);
    return cleaned;
  },
};

const demo = {
  accounts(): { email: string; password: string; role: Role; name: string }[] {
    ensureSeeded();
    return read<User[]>(USERS_KEY, []).map((u) => ({
      email: u.email,
      password: u.password,
      role: u.role,
      name: u.name,
    }));
  },

  reset(): void {
    try {
      localStorage.removeItem(USERS_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(BRIEFS_KEY);
      localStorage.removeItem(APPS_KEY);
      localStorage.removeItem(SEED_FLAG_KEY);
    } catch {
      // ignore
    }
    seedIfEmpty();
  },
};

export const store = { auth, briefs, applications, companies, demo };
