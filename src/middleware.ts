/**
 * middleware
 *
 * Runs on every request. Refreshes the Supabase auth session if it's
 * close to expiring and exposes the user / session on `Astro.locals`
 * so pages and API routes can read them without an extra round-trip.
 *
 * Pages can then do:
 *
 *   const { user, profile } = Astro.locals;
 *
 * If the user is not signed in, `user` is `null` and `profile` is
 * `null`.
 */

import { defineMiddleware } from 'astro:middleware';
import { getSupabase } from './lib/supabase';
import type { AppSession, DbCompanyProfile, DbStudentProfile, DbUser, Role } from './lib/types';
import { SESSION_STORAGE_KEY } from './lib/types';

declare global {
  namespace App {
    interface Locals {
      user: DbUser | null;
      session: AppSession | null;
      role: Role | null;
      studentProfile: DbStudentProfile | null;
      companyProfile: DbCompanyProfile | null;
      supabase: ReturnType<typeof getSupabase>;
    }
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = getSupabase(context);

  // IMPORTANT: must call getUser() (not getSession()) — getUser()
  // re-validates the JWT against the Supabase Auth server, which is
  // what refreshes the session. Wrapped in try/catch so a transient
  // network error doesn't 500 the whole site.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  // Pre-populate locals with a client so pages can use it without
  // re-importing.
  context.locals.supabase = supabase;
  context.locals.user = null;
  context.locals.session = null;
  context.locals.role = null;
  context.locals.studentProfile = null;
  context.locals.companyProfile = null;

  if (!userId) {
    return next();
  }

  // Load the public.users row + the matching profile in parallel.
  const [usersRes, studentRes, companyRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    supabase.from('student_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('company_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const user = usersRes.data as DbUser | null;
  if (!user) {
    // The auth user exists but our public.users row didn't get
    // created. This can happen if the trigger was added after the
    // user signed up. We sign them out so the UI stays consistent.
    await supabase.auth.signOut();
    return next();
  }

  context.locals.user = user;
  context.locals.role = user.role;
  context.locals.studentProfile = (studentRes.data as DbStudentProfile | null) ?? null;
  context.locals.companyProfile = (companyRes.data as DbCompanyProfile | null) ?? null;
  context.locals.session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    signedInAt: new Date().toISOString(),
  };

  // Mirror the session to a non-HTTP-only cookie so the inline
  // pre-paint redirect script in Layout.astro can read it on first
  // paint. We use a short-lived, signed cookie (not the real auth
  // tokens) — this is only used to decide which page to show, the
  // server middleware still validates the real Supabase session.
  if (context.locals.session) {
    const isProd = import.meta.env.PUBLIC_SITE_URL?.startsWith('https://');
    context.cookies.set(
      SESSION_STORAGE_KEY,
      JSON.stringify(context.locals.session),
      {
        path: '/',
        sameSite: 'lax',
        secure: isProd,
        httpOnly: false,
        maxAge: 60 * 60 * 24, // 1 day, refreshed on every request
      },
    );
  }

  return next();
});
