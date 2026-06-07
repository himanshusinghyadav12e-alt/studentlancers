# scripts/

Operational scripts that don't ship with the app.

## smoke-test-signup.ts

End-to-end check that the Supabase wiring actually works against a
real project. Signs up a new student, verifies the
`handle_new_auth_user` trigger created the matching rows in
`public.users` and `public.student_profiles`, signs back in, and
cleans up.

### When to run

- After you apply `supabase/migrations/0001_initial_schema.sql` for
  the first time — proves the migration is wired up correctly.
- After any change to the auth trigger, RLS policies, or
  `src/lib/supabase.ts` / `src/lib/supabase-browser.ts`.
- Before deploying to a new environment.

### How to run

```bash
# 1. Make sure .env has real values (not placeholders)
cat .env
#   PUBLIC_SUPABASE_URL=https://abcdefg.supabase.co
#   PUBLIC_SUPABASE_ANON_KEY=eyJ...
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 2. Run the smoke test
npm run smoke
```

The script prints a `✓` line for every check and exits non-zero with
a clear `✗` line if anything fails. It also tells you how to fix the
common cases (e.g. email confirmation is enabled).

### What it does NOT cover

- The browser-side `auth-form.ts` script. The signup call here goes
  through the server-side `@supabase/ssr` client; the browser client
  is the same code under the hood, but visual / DOM-level bugs
  (e.g. the form not submitting) require a real browser.
- Email-confirmation flow. If you have confirmation on, the test
  will fail with a message telling you to disable it (or click the
  link in the test inbox and re-run).
- OAuth / magic-link. Add a separate test for those flows if you
  enable them.

### Security note

The script reads `SUPABASE_SERVICE_ROLE_KEY` from `.env`. That key
bypasses RLS — keep it out of the browser bundle (the `serverEnv()`
helper in `src/lib/env.ts` throws if you try). Never commit `.env`,
never paste the service-role key into a chat or a screenshot.
