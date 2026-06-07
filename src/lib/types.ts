/**
 * types
 *
 * Shared TypeScript types mirroring the database schema. Kept hand-
 * written (rather than `supabase gen types`) so the project still
 * type-checks before the user has connected Supabase. Once the
 * generator is wired up, this file can be replaced wholesale.
 */

export type Role = 'student' | 'company';
export type JobStatus = 'draft' | 'open' | 'closed' | 'filled';
export type ApplicationStatus = 'new' | 'shortlisted' | 'hired' | 'rejected';

export interface DbUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface DbStudentProfile {
  user_id: string;
  bio: string | null;
  university: string | null;
  major: string | null;
  graduation_year: number | null;
  hourly_rate_cents: number | null;
  skills: string[];
  portfolio_url: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export interface DbCompanyProfile {
  user_id: string;
  company_name: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  logo_url: string | null;
  blurb: string | null;
  updated_at: string;
}

export interface DbJob {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  budget_type: 'fixed' | 'hourly';
  budget_cents: number;
  duration: string | null;
  hours: string | null;
  skills: string[];
  links: string | null;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}

export interface DbApplication {
  id: string;
  job_id: string;
  applicant_id: string;
  cover: string;
  rate_cents: number | null;
  timeline: string | null;
  portfolio_url: string | null;
  status: ApplicationStatus;
  hired_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Application shape used in the rest of the UI. Built by joining
 * `applications` with `jobs` and `users` so list pages can render in
 * a single round-trip. The `job` and `applicant` sub-objects are
 * populated by the select() in src/lib/api.ts; they are non-null
 * because we always select them together.
 */
export interface ApplicationWithJob extends DbApplication {
  job: Pick<DbJob, 'id' | 'title' | 'owner_id' | 'budget_type' | 'budget_cents'>;
  applicant: { id: string; name: string; email: string };
}

/**
 * Mirror of `store.Session` — kept compatible with the existing
 * pre-paint redirect script in Layout.astro and DashboardLayout.astro
 * so we don't have to rewrite that logic.
 */
export interface AppSession {
  userId: string;
  email: string;
  name: string;
  role: Role;
  signedInAt: string;
}

export const SESSION_STORAGE_KEY = 'sl-session';
