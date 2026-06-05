/**
 * store
 *
 * Tiny localStorage-backed "API" for the StudentLancers demo. Acts as the
 * single source of truth for auth, briefs, and applications so the rest
 * of the UI can pretend there is a real backend.
 *
 * What lives in localStorage:
 *   - `sl-users`        — array of registered accounts (email + role + name)
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
}

const USERS_KEY = 'sl-users';
const SESSION_KEY = 'sl-session';
const BRIEFS_KEY = 'sl-briefs';
const APPS_KEY = 'sl-applications';
const SEED_FLAG_KEY = 'sl-seeded-v1';

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
    },
  ];
  write(USERS_KEY, seedUsers);
  write(SESSION_KEY, null);
  write(BRIEFS_KEY, [] as Brief[]);
  write(APPS_KEY, [] as Application[]);
  try {
    localStorage.setItem(SEED_FLAG_KEY, '1');
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

  create(input: Omit<Application, 'id' | 'createdAt'>): Application {
    ensureSeeded();
    const list = read<Application[]>(APPS_KEY, []);
    const app: Application = {
      ...input,
      id: shortId('APP'),
      createdAt: nowIso(),
    };
    list.unshift(app);
    write(APPS_KEY, list);
    return app;
  },
};

/* ─── Demo helpers ─────────────────────────────────────────────── */

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

export const store = { auth, briefs, applications, demo };
