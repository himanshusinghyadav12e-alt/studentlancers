-- ============================================================================
-- StudentLancers.com — initial schema
-- Migration: 0001_initial_schema.sql
--
-- Tables:
--   public.users            — extends auth.users with role + display fields
--   public.student_profiles — extra fields for student accounts (1:1 → users)
--   public.company_profiles — extra fields for company accounts (1:1 → users)
--   public.jobs             — briefs posted by companies
--   public.applications     — student → job link with review state
--
-- Conventions:
--   * Every table has `id uuid primary key default gen_random_uuid()` and
--     `created_at timestamptz default now()` for ordering and audit.
--   * Profile tables use `user_id uuid primary key references public.users(id)`
--     to enforce 1:1 ownership.
--   * RLS is enabled on every public table. Policies are restrictive by
--     default — a row is only visible to the user that owns it (or, for
--     jobs/applications, the relevant counterparties).
--   * A trigger on auth.users inserts a row into public.users on signup,
--     then a second trigger creates the matching profile row based on
--     the requested role.
-- ============================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('student', 'company');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('draft', 'open', 'closed', 'filled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum ('new', 'shortlisted', 'hired', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------- public.users ----------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text not null,
  role        user_role not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);

-- ---------- public.student_profiles ----------
create table if not exists public.student_profiles (
  user_id      uuid primary key references public.users(id) on delete cascade,
  bio          text,
  university   text,
  major        text,
  graduation_year int,
  hourly_rate_cents int,
  skills       text[] not null default '{}',
  portfolio_url text,
  avatar_url   text,
  updated_at   timestamptz not null default now()
);

-- ---------- public.company_profiles ----------
create table if not exists public.company_profiles (
  user_id      uuid primary key references public.users(id) on delete cascade,
  company_name text,
  website      text,
  industry     text,
  size         text,
  logo_url     text,
  blurb        text,
  updated_at   timestamptz not null default now()
);

-- ---------- public.jobs ----------
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  title        text not null,
  category     text not null,
  summary      text not null,
  description  text not null,
  budget_type  text not null check (budget_type in ('fixed', 'hourly')),
  budget_cents int  not null check (budget_cents >= 0),
  duration     text,
  hours        text,
  skills       text[] not null default '{}',
  links        text,
  status       job_status not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jobs_owner_idx      on public.jobs (owner_id);
create index if not exists jobs_status_idx     on public.jobs (status);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_skills_gin     on public.jobs using gin (skills);

-- ---------- public.applications ----------
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  applicant_id    uuid not null references public.users(id) on delete cascade,
  cover           text not null,
  rate_cents      int,
  timeline        text,
  portfolio_url   text,
  status          application_status not null default 'new',
  hired_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- A student can only apply once per job.
  unique (job_id, applicant_id)
);

create index if not exists applications_job_idx       on public.applications (job_id);
create index if not exists applications_applicant_idx on public.applications (applicant_id);
create index if not exists applications_status_idx    on public.applications (status);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger student_profiles_updated_at
    before update on public.student_profiles
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger company_profiles_updated_at
    before update on public.company_profiles
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger jobs_updated_at
    before update on public.jobs
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger applications_updated_at
    before update on public.applications
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ---------- Signup → profile bootstrap ----------
--
-- The signup form posts `{ email, password, name, role }` to
-- supabase.auth.signUp(). The role + name live in raw_user_meta_data.
-- This trigger reads that metadata and creates the matching rows in
-- public.users and (student_profiles | company_profiles).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_name  text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  insert into public.users (id, email, name, role)
  values (new.id, new.email, v_name, v_role::user_role)
  on conflict (id) do nothing;

  if v_role = 'company' then
    insert into public.company_profiles (user_id, company_name)
    values (new.id, v_name)
    on conflict (user_id) do nothing;
  else
    insert into public.student_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------- Row Level Security ----------
alter table public.users            enable row level security;
alter table public.student_profiles enable row level security;
alter table public.company_profiles enable row level security;
alter table public.jobs             enable row level security;
alter table public.applications     enable row level security;

-- Helper: is the current request authenticated?
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- users: a user can read their own row; companies read applicants who
-- have applied to their jobs (used by /company/applicants).
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select using (id = public.current_user_id());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = public.current_user_id())
  with check (id = public.current_user_id());

-- student_profiles: visible to everyone (it's a marketplace) but
-- only the owner can write.
drop policy if exists student_profiles_select_all on public.student_profiles;
create policy student_profiles_select_all on public.student_profiles
  for select using (true);

drop policy if exists student_profiles_upsert_self on public.student_profiles;
create policy student_profiles_upsert_self on public.student_profiles
  for insert with check (user_id = public.current_user_id());

drop policy if exists student_profiles_update_self on public.student_profiles;
create policy student_profiles_update_self on public.student_profiles
  for update using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- company_profiles: visible to everyone; only the owner can write.
drop policy if exists company_profiles_select_all on public.company_profiles;
create policy company_profiles_select_all on public.company_profiles
  for select using (true);

drop policy if exists company_profiles_upsert_self on public.company_profiles;
create policy company_profiles_upsert_self on public.company_profiles
  for insert with check (user_id = public.current_user_id());

drop policy if exists company_profiles_update_self on public.company_profiles;
create policy company_profiles_update_self on public.company_profiles
  for update using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- jobs: anyone (incl. anon) can read open jobs; only the owner can
-- write. Drafts are private to the owner.
drop policy if exists jobs_select_open_or_owner on public.jobs;
create policy jobs_select_open_or_owner on public.jobs
  for select using (
    status = 'open'
    or owner_id = public.current_user_id()
  );

drop policy if exists jobs_insert_owner_company on public.jobs;
create policy jobs_insert_owner_company on public.jobs
  for insert with check (
    owner_id = public.current_user_id()
    and exists (
      select 1 from public.users
      where id = public.current_user_id() and role = 'company'
    )
  );

drop policy if exists jobs_update_owner on public.jobs;
create policy jobs_update_owner on public.jobs
  for update using (owner_id = public.current_user_id())
  with check (owner_id = public.current_user_id());

drop policy if exists jobs_delete_owner on public.jobs;
create policy jobs_delete_owner on public.jobs
  for delete using (owner_id = public.current_user_id());

-- applications: the applicant and the job's owner can read; only the
-- applicant can insert; the job's owner can update status (hire,
-- reject, shortlist).
drop policy if exists applications_select_parties on public.applications;
create policy applications_select_parties on public.applications
  for select using (
    applicant_id = public.current_user_id()
    or exists (
      select 1 from public.jobs
      where jobs.id = applications.job_id
        and jobs.owner_id = public.current_user_id()
    )
  );

drop policy if exists applications_insert_student on public.applications;
create policy applications_insert_student on public.applications
  for insert with check (
    applicant_id = public.current_user_id()
    and exists (
      select 1 from public.users
      where id = public.current_user_id() and role = 'student'
    )
  );

drop policy if exists applications_update_owner on public.applications;
create policy applications_update_owner on public.applications
  for update using (
    exists (
      select 1 from public.jobs
      where jobs.id = applications.job_id
        and jobs.owner_id = public.current_user_id()
    )
  );

-- ============================================================================
-- End of migration.
-- ============================================================================
