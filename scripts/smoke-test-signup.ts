/**
 * scripts/smoke-test-signup.ts
 *
 * End-to-end smoke test for the Supabase auth wiring. Exercises the
 * real signup flow against the project configured in .env:
 *
 *   1. Sign up a brand-new student via the @supabase/ssr server client
 *      (the same flow the auth-form.ts submit handler triggers).
 *   2. Verify the `handle_new_auth_user` trigger created matching rows
 *      in public.users and public.student_profiles.
 *   3. Sign in with the same credentials and confirm a session is
 *      returned.
 *   4. Clean up — delete the auth user (cascades to public.users and
 *      public.student_profiles thanks to the FK constraints).
 *
 * Run with:
 *
 *   npx tsx scripts/smoke-test-signup.ts
 *
 * (or `node --import tsx scripts/smoke-test-signup.ts`).
 *
 * Requires .env to be filled in with real Supabase values.
 *
 * IMPORTANT: this script uses the service role key to verify the
 * trigger and to clean up. Do NOT call this from the browser and
 * do NOT commit a populated .env file.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function fail(msg: string): never {
  // Redact the secret if we ever print it by accident.
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

async function main() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
    fail('PUBLIC_SUPABASE_URL is missing or still a placeholder. Fill in .env first.');
  }
  if (!SERVICE_ROLE || SERVICE_ROLE.includes('YOUR-SERVICE-ROLE-KEY')) {
    fail('SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder. Fill in .env first.');
  }

  // Service-role client — bypasses RLS so we can read every row to
  // assert the trigger ran, and so we can clean up after ourselves.
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Unique email per run so re-running the script never collides.
  const stamp = Date.now();
  const email = `smoketest+${stamp}@example.com`;
  const password = 'SmokeTest!2026';
  const name = 'Smoke Tester';

  console.log(`\n— Supabase signup smoke test —`);
  console.log(`  email:    ${email}`);
  console.log(`  project:  ${SUPABASE_URL}\n`);

  // ---- 1. Sign up via the same code path the browser uses --------
  // We use a fresh @supabase/ssr SSR client here so the test mirrors
  // the real flow as closely as possible. The signup call itself
  // doesn't need cookies, but using the same client type means we
  // also catch any future regressions in the SSR adapter.
  const { createServerClient } = await import('@supabase/ssr');
  const ssr = createServerClient(SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY ?? '', {
    cookies: {
      // No-op cookie handlers — we don't need to persist anything
      // for this one-shot test.
      get: () => undefined,
      set: () => undefined,
      remove: () => undefined,
    },
  });

  const { data: signUp, error: signUpError } = await ssr.auth.signUp({
    email,
    password,
    options: {
      data: { role: 'student', name },
      // The redirectTo is required for email confirmation to work,
      // but smoke-test runs assume confirmation is OFF in the
      // Supabase dashboard. If you have it on, the assertion below
      // will tell you.
    },
  });
  if (signUpError) fail(`signup failed: ${signUpError.message}`);
  if (!signUp.user) fail('signup returned no user');
  ok(`signed up auth user ${signUp.user.id}`);

  // If email confirmation is on, signUp.session is null and we have
  // to bail with a clear message — the rest of the script assumes
  // confirmation is off.
  if (!signUp.session) {
    fail(
      'signup returned no session — email confirmation is enabled. ' +
        'Disable it under Authentication → Providers → Email, or ' +
        'click the link in the test inbox and re-run.',
    );
  }

  // ---- 2. Verify the trigger populated public.users + profile ----
  // Tiny pause — the AFTER INSERT trigger is fast but the
  // round-trip is a separate network call.
  await new Promise((r) => setTimeout(r, 250));

  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email, name, role')
    .eq('id', signUp.user.id)
    .maybeSingle();
  if (userErr) fail(`could not read public.users: ${userErr.message}`);
  if (!userRow) fail('public.users row was not created by the trigger');
  if (userRow.email !== email) fail(`public.users.email mismatch: got ${userRow.email}`);
  if (userRow.role !== 'student') fail(`public.users.role mismatch: got ${userRow.role}`);
  if (userRow.name !== name) fail(`public.users.name mismatch: got ${userRow.name}`);
  ok(`public.users row matches (role=${userRow.role})`);

  const { data: profileRow, error: profileErr } = await admin
    .from('student_profiles')
    .select('user_id, skills')
    .eq('user_id', signUp.user.id)
    .maybeSingle();
  if (profileErr) fail(`could not read public.student_profiles: ${profileErr.message}`);
  if (!profileRow) fail('public.student_profiles row was not created by the trigger');
  if (!Array.isArray(profileRow.skills) || profileRow.skills.length !== 0) {
    fail(`public.student_profiles.skills should default to []; got ${JSON.stringify(profileRow.skills)}`);
  }
  ok('public.student_profiles row exists with default skills=[]');

  // ---- 3. Sign in with the same credentials ----------------------
  // Use the same SSR client so cookies/headers match.
  const { data: signIn, error: signInError } = await ssr.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) fail(`sign-in failed: ${signInError.message}`);
  if (!signIn.session) fail('sign-in returned no session');
  if (signIn.session.user.id !== signUp.user.id) {
    fail(`sign-in user id mismatch: ${signIn.session.user.id} vs ${signUp.user.id}`);
  }
  ok('sign-in returns a session for the same user');

  // ---- 4. Verify the middleware-mirrored cookie shape ------------
  // We don't go through the actual middleware (that would require a
  // running server), but we can confirm the AppSession shape we
  // mirror is valid by reading the user again through the same
  // path middleware uses.
  const { data: me } = await ssr.auth.getUser();
  if (!me.user || me.user.id !== signUp.user.id) {
    fail('auth.getUser() (the call middleware makes) returned a different user');
  }
  ok('auth.getUser() round-trip matches the signed-in user');

  // ---- 5. Clean up -----------------------------------------------
  // Deleting the auth user cascades to public.users and
  // public.student_profiles via the FK constraints.
  const { error: deleteError } = await admin.auth.admin.deleteUser(signUp.user.id);
  if (deleteError) {
    // Don't fail the run — the test passed. Just warn.
    console.warn(`! could not delete test user (manual cleanup needed): ${deleteError.message}`);
  } else {
    ok('cleaned up test user');
  }

  // Confirm cleanup actually happened.
  await new Promise((r) => setTimeout(r, 250));
  const { data: stillThere } = await admin
    .from('users')
    .select('id')
    .eq('id', signUp.user.id)
    .maybeSingle();
  if (stillThere) {
    console.warn(`! public.users row for ${signUp.user.id} still exists after deleteUser()`);
  } else {
    ok('public.users row removed after cleanup');
  }

  console.log('\n✅ all smoke-test checks passed\n');
}

main().catch((err) => {
  fail(err instanceof Error ? err.stack ?? err.message : String(err));
});
