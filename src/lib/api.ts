/**
 * api
 *
 * Server-side data access against Supabase. Every function here runs
 * on the Astro server (SSR) and uses the request-scoped Supabase
 * client that the middleware attaches to `Astro.locals.supabase`.
 *
 * The split from `src/scripts/store.ts` (the localStorage mock):
 *   - The store is still used by older pages as a fallback. New code
 *     should use the helpers here so reads / writes hit real Postgres.
 *   - All helpers respect the RLS policies in
 *     `supabase/migrations/0001_initial_schema.sql`. The middleware
 *     has already refreshed the session and exposed
 *     `Astro.locals.user`, so we use that user id directly.
 *
 * Errors are thrown as `ApiError` so the API route can map them to
 * HTTP status codes without leaking Supabase internals.
 */

import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApplicationStatus,
  ApplicationWithJob,
  DbApplication,
  DbCompanyProfile,
  DbJob,
  DbStudentProfile,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type Ctx = AstroGlobal | APIContext;

/** Pull the request-scoped Supabase client the middleware exposes. */
function supabaseOf(ctx: Ctx): SupabaseClient {
  // Both AstroGlobal and APIContext satisfy this shape; the
  // middleware always populates locals.supabase.
  const client = (ctx.locals as { supabase?: SupabaseClient }).supabase;
  if (!client) {
    throw new ApiError('Supabase client is not available on this request.', 500, 'no_client');
  }
  return client;
}

function requireUser(ctx: Ctx): { id: string; role: 'student' | 'company' } {
  const user = (ctx.locals as { user?: { id: string; role: 'student' | 'company' } | null }).user;
  if (!user) {
    throw new ApiError('You need to be signed in to do that.', 401, 'unauthenticated');
  }
  return user;
}

/* ─── Student profile ────────────────────────────────────────── */

export interface StudentProfileInput {
  name?: string;
  bio?: string | null;
  university?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  hourlyRateCents?: number | null;
  skills?: string[];
  portfolioUrl?: string | null;
  avatarUrl?: string | null;
}

/**
 * Upsert the signed-in student's profile. The matching row in
 * public.users is also updated when the caller passes a new display
 * name (we never write to the auth.users row — that requires the
 * service role).
 */
export async function upsertStudentProfile(
  ctx: Ctx,
  input: StudentProfileInput,
): Promise<DbStudentProfile> {
  const user = requireUser(ctx);
  if (user.role !== 'student') {
    throw new ApiError('Only student accounts can edit a student profile.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  if (typeof input.name === 'string' && input.name.trim()) {
    const { error: nameErr } = await supabase
      .from('users')
      .update({ name: input.name.trim() })
      .eq('id', user.id);
    if (nameErr) {
      throw new ApiError(nameErr.message, 500, 'update_user_failed');
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.university !== undefined) patch.university = input.university;
  if (input.major !== undefined) patch.major = input.major;
  if (input.graduationYear !== undefined) patch.graduation_year = input.graduationYear;
  if (input.hourlyRateCents !== undefined) patch.hourly_rate_cents = input.hourlyRateCents;
  if (input.skills !== undefined) patch.skills = input.skills;
  if (input.portfolioUrl !== undefined) patch.portfolio_url = input.portfolioUrl;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  const { data, error } = await supabase
    .from('student_profiles')
    .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) {
    throw new ApiError(error.message, 500, 'upsert_student_profile_failed');
  }
  return data as DbStudentProfile;
}

export async function getStudentProfile(
  ctx: Ctx,
  userId: string,
): Promise<DbStudentProfile | null> {
  const supabase = supabaseOf(ctx);
  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(error.message, 500, 'read_student_profile_failed');
  return (data as DbStudentProfile | null) ?? null;
}

/* ─── Company profile ────────────────────────────────────────── */

export interface CompanyProfileInput {
  name?: string;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  logoUrl?: string | null;
  blurb?: string | null;
}

export async function upsertCompanyProfile(
  ctx: Ctx,
  input: CompanyProfileInput,
): Promise<DbCompanyProfile> {
  const user = requireUser(ctx);
  if (user.role !== 'company') {
    throw new ApiError('Only company accounts can edit a company profile.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  if (typeof input.name === 'string' && input.name.trim()) {
    const { error: nameErr } = await supabase
      .from('users')
      .update({ name: input.name.trim() })
      .eq('id', user.id);
    if (nameErr) {
      throw new ApiError(nameErr.message, 500, 'update_user_failed');
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.website !== undefined) patch.website = input.website;
  if (input.industry !== undefined) patch.industry = input.industry;
  if (input.size !== undefined) patch.size = input.size;
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
  if (input.blurb !== undefined) patch.blurb = input.blurb;

  // The signup trigger seeds company_name = the user's display name,
  // so we never write to company_name here (it's the source of truth
  // for /company/profile and the briefs list).
  const { data, error } = await supabase
    .from('company_profiles')
    .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) {
    throw new ApiError(error.message, 500, 'upsert_company_profile_failed');
  }
  return data as DbCompanyProfile;
}

export async function getCompanyProfile(
  ctx: Ctx,
  userId: string,
): Promise<DbCompanyProfile | null> {
  const supabase = supabaseOf(ctx);
  const { data, error } = await supabase
    .from('company_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(error.message, 500, 'read_company_profile_failed');
  return (data as DbCompanyProfile | null) ?? null;
}

/* ─── Jobs ───────────────────────────────────────────────────── */

export interface JobInput {
  title: string;
  category: string;
  summary: string;
  description: string;
  budgetType: 'fixed' | 'hourly';
  budgetCents: number;
  duration: string;
  hours: string;
  skills: string[];
  links?: string | null;
}

export async function createJob(ctx: Ctx, input: JobInput): Promise<DbJob> {
  const user = requireUser(ctx);
  if (user.role !== 'company') {
    throw new ApiError('Only company accounts can post briefs.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      owner_id: user.id,
      title: input.title,
      category: input.category,
      summary: input.summary,
      description: input.description,
      budget_type: input.budgetType,
      budget_cents: input.budgetCents,
      duration: input.duration,
      hours: input.hours,
      skills: input.skills,
      links: input.links ?? null,
      status: 'open',
    })
    .select('*')
    .single();
  if (error) {
    throw new ApiError(error.message, 500, 'insert_job_failed');
  }
  return data as DbJob;
}

export async function listJobsForOwner(ctx: Ctx): Promise<DbJob[]> {
  const user = requireUser(ctx);
  const supabase = supabaseOf(ctx);
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 500, 'list_jobs_failed');
  return (data as DbJob[]) ?? [];
}

export async function getJob(ctx: Ctx, jobId: string): Promise<DbJob | null> {
  const supabase = supabaseOf(ctx);
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new ApiError(error.message, 500, 'read_job_failed');
  return (data as DbJob | null) ?? null;
}

/**
 * Shape used by the public listing on /student/find-work. We join
 * public.users (the brief's owner) so the company name renders in
 * the card. `status = 'open'` is enforced by the RLS policy on
 * public.jobs — anonymous and student callers only see open briefs.
 */
export interface ListedJob {
  id: string;
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
  status: 'draft' | 'open' | 'closed' | 'filled';
  created_at: string;
  owner_id: string;
  /** Resolved company display name. `public.users.name` for company
   * accounts holds the company name (set at signup); for the rare
   * personal-account edge case we fall back to the user's name. */
  company_name: string;
}

export async function listOpenJobs(ctx: Ctx): Promise<ListedJob[]> {
  const supabase = supabaseOf(ctx);
  // RLS gives us only `status = 'open'` (or rows the caller owns),
  // so we don't need an explicit `eq` filter for status here.
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, title, category, summary, description, budget_type, budget_cents, duration, hours, skills, links, status, created_at, owner_id, owner:users!jobs_owner_id_fkey(name, company_name:company_profiles(company_name))',
    )
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 500, 'list_jobs_failed');
  type Row = Omit<ListedJob, 'company_name'> & {
    owner: { name: string; company_profiles: { company_name: string | null } | null } | null;
  };
  const rows = ((data as unknown as Row[]) ?? []).filter((r) => r.status === 'open');
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    summary: r.summary,
    description: r.description,
    budget_type: r.budget_type,
    budget_cents: r.budget_cents,
    duration: r.duration,
    hours: r.hours,
    skills: r.skills,
    links: r.links,
    status: r.status,
    created_at: r.created_at,
    owner_id: r.owner_id,
    company_name:
      r.owner?.company_profiles?.company_name ??
      r.owner?.name ??
      'A company on StudentLancers',
  }));
}

/** Read a single job joined with the owner name — used by /jobs/[id]. */
export async function getListedJob(ctx: Ctx, jobId: string): Promise<ListedJob | null> {
  const supabase = supabaseOf(ctx);
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, title, category, summary, description, budget_type, budget_cents, duration, hours, skills, links, status, created_at, owner_id, owner:users!jobs_owner_id_fkey(name, company_profiles(company_name))',
    )
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new ApiError(error.message, 500, 'read_listed_job_failed');
  if (!data) return null;
  type Row = Omit<ListedJob, 'company_name'> & {
    owner: { name: string; company_profiles: { company_name: string | null } | null } | null;
  };
  const r = data as unknown as Row;
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    summary: r.summary,
    description: r.description,
    budget_type: r.budget_type,
    budget_cents: r.budget_cents,
    duration: r.duration,
    hours: r.hours,
    skills: r.skills,
    links: r.links,
    status: r.status,
    created_at: r.created_at,
    owner_id: r.owner_id,
    company_name:
      r.owner?.company_profiles?.company_name ??
      r.owner?.name ??
      'A company on StudentLancers',
  };
}

/* ─── Applications ───────────────────────────────────────────── */

export interface ApplicationInput {
  jobId: string;
  cover: string;
  rateCents?: number | null;
  timeline?: string | null;
  portfolioUrl?: string | null;
}

export async function createApplication(
  ctx: Ctx,
  input: ApplicationInput,
): Promise<DbApplication> {
  const user = requireUser(ctx);
  if (user.role !== 'student') {
    throw new ApiError('Only student accounts can apply to briefs.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  // Look up the job so we can surface "this brief is closed / not
  // found" as a real error rather than a generic FK violation. The
  // owner-only RLS policy on jobs means the student will only see
  // open briefs, which is exactly the set they can apply to.
  const job = await getJob(ctx, input.jobId);
  if (!job) {
    throw new ApiError('That brief is no longer available.', 404, 'job_not_found');
  }
  if (job.status !== 'open') {
    throw new ApiError('That brief is no longer accepting applications.', 409, 'job_closed');
  }

  const { data, error } = await supabase
    .from('applications')
    .insert({
      job_id: input.jobId,
      applicant_id: user.id,
      cover: input.cover,
      rate_cents: input.rateCents ?? null,
      timeline: input.timeline ?? null,
      portfolio_url: input.portfolioUrl ?? null,
      status: 'new',
    })
    .select('*')
    .single();
  if (error) {
    // 23505 = unique_violation in Postgres — the student has already
    // applied to this brief. Surface it as a friendly 409.
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      throw new ApiError('You have already applied to this brief.', 409, 'duplicate_application');
    }
    throw new ApiError(error.message, 500, 'insert_application_failed');
  }
  return data as DbApplication;
}

export interface ApplicationWithJobLocal {
  job: Pick<DbJob, 'id' | 'title' | 'owner_id' | 'budget_type' | 'budget_cents'>;
  applicant: { id: string; name: string; email: string };
}

/**
 * Every application on a brief owned by the signed-in company. Used
 * by /company/applicants. RLS already restricts this to the brief
 * owner; we add the explicit filter so the response shape is stable.
 */
export async function listApplicationsForOwner(ctx: Ctx): Promise<ApplicationWithJob[]> {
  const user = requireUser(ctx);
  if (user.role !== 'company') {
    throw new ApiError('Only company accounts can review applicants.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, job_id, applicant_id, cover, rate_cents, timeline, portfolio_url, status, hired_at, created_at, updated_at, ' +
        'job:jobs(id, title, owner_id, budget_type, budget_cents), ' +
        'applicant:users!applications_applicant_id_fkey(id, name, email)',
    )
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 500, 'list_applications_failed');

  // RLS returns only the rows the caller can see — for a company
  // that's the ones on their own briefs. We still filter explicitly
  // so a misconfigured policy can't ever leak a stranger's
  // application.
  const rows = (data as unknown as ApplicationWithJob[]) ?? [];
  return rows.filter((row) => row.job && row.job.owner_id === user.id);
}

/** Every application the signed-in student has submitted. */
export async function listApplicationsForApplicant(ctx: Ctx): Promise<ApplicationWithJob[]> {
  const user = requireUser(ctx);
  if (user.role !== 'student') {
    throw new ApiError('Only student accounts can list their applications.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, job_id, applicant_id, cover, rate_cents, timeline, portfolio_url, status, hired_at, created_at, updated_at, ' +
        'job:jobs(id, title, owner_id, budget_type, budget_cents), ' +
        'applicant:users!applications_applicant_id_fkey(id, name, email)',
    )
    .eq('applicant_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 500, 'list_applications_failed');
  return (data as unknown as ApplicationWithJob[]) ?? [];
}

export async function setApplicationStatus(
  ctx: Ctx,
  applicationId: string,
  status: ApplicationStatus,
): Promise<{ application: DbApplication; autoRejected: DbApplication[] }> {
  const user = requireUser(ctx);
  if (user.role !== 'company') {
    throw new ApiError('Only company accounts can update applicant status.', 403, 'wrong_role');
  }
  const supabase = supabaseOf(ctx);

  if (status === 'hired') {
    // Read the target row first so we know the job id and can auto-
    // reject the other open applications on the same brief. We rely
    // on a single round-trip via a Postgres RPC-style update below.
    const { data: target, error: readErr } = await supabase
      .from('applications')
      .select('id, job_id, status')
      .eq('id', applicationId)
      .maybeSingle();
    if (readErr) throw new ApiError(readErr.message, 500, 'read_application_failed');
    if (!target) throw new ApiError('Application not found.', 404, 'application_not_found');

    // Auto-reject every other non-final application on the same brief.
    const { data: rejected, error: rejectErr } = await supabase
      .from('applications')
      .update({ status: 'rejected' })
      .eq('job_id', target.job_id)
      .neq('id', applicationId)
      .in('status', ['new', 'shortlisted'])
      .select('*');
    if (rejectErr) throw new ApiError(rejectErr.message, 500, 'auto_reject_failed');

    // Mark the chosen applicant as hired.
    const { data: hired, error: hireErr } = await supabase
      .from('applications')
      .update({ status: 'hired', hired_at: new Date().toISOString() })
      .eq('id', applicationId)
      .select('*')
      .single();
    if (hireErr) throw new ApiError(hireErr.message, 500, 'hire_failed');

    // Close the brief so further applications bounce.
    await supabase.from('jobs').update({ status: 'filled' }).eq('id', target.job_id);

    return {
      application: hired as DbApplication,
      autoRejected: (rejected as DbApplication[]) ?? [],
    };
  }

  // Non-hire transitions: shortlist / reject / restore-to-new.
  const { data, error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', applicationId)
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError('Application not found.', 404, 'application_not_found');
    }
    throw new ApiError(error.message, 500, 'update_application_failed');
  }
  return { application: data as DbApplication, autoRejected: [] };
}
