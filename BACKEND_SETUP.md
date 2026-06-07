# Backend Setup — Supabase

This doc covers wiring StudentLancers.com up to a Supabase project.
The UI is unchanged; the only difference is that auth, user data, and
the (soon-to-be-wired) jobs/applications tables are now backed by a
real Postgres database.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> and sign up.
2. Create a new project. Pick a region close to your users. The free
   tier is fine for development.
3. Wait for the project to finish provisioning (~2 minutes).

## 2. Copy your project credentials

In your Supabase dashboard, open **Project Settings → API**.

You need three values:

| Variable                          | Where it's used                  |
| --------------------------------- | -------------------------------- |
| `Project URL`                     | `PUBLIC_SUPABASE_URL`            |
| `anon public` key                 | `PUBLIC_SUPABASE_ANON_KEY`       |
| `service_role` key (secret)       | `SUPABASE_SERVICE_ROLE_KEY`      |

## 3. Configure local environment

```bash
cp .env.example .env
```

Open `.env` and paste the three values. Set `PUBLIC_SITE_URL` to your
local dev origin (`http://localhost:4321` for `astro dev`).

> ⚠️ The `service_role` key bypasses Row Level Security. **Never**
> expose it to the browser. The codebase only reads it from
> `src/lib/env.ts`'s `serverEnv()` helper, which throws if called in
> a browser context.

## 4. Apply the database migration

The schema lives in `supabase/migrations/0001_initial_schema.sql`.
Apply it with the Supabase SQL editor or the Supabase CLI.

### Option A — SQL editor (one-off)

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/migrations/0001_initial_schema.sql`.
3. Click **Run**.

### Option B — Supabase CLI (recommended for repeated runs)

```bash
# Install the CLI once
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# Apply the migration
supabase db push
```

The migration is **idempotent** — every `create` uses `if not exists`
or `do $$ … exception when duplicate_object then null; end $$`, so
re-running it is safe.

## 5. Configure auth providers (optional)

By default, sign-in is email + password. To enable magic links or
Google OAuth:

1. In the Supabase dashboard, open **Authentication → Providers**.
2. Toggle on **Email** (magic link) and/or **Google**.
3. Add `http://localhost:4321/auth/callback` to **Site URL** /
   **Redirect URLs**.

The login and signup forms already include a "Continue with Google"
button — once you enable the provider in Supabase, swap the stub in
`src/scripts/auth-form.ts::attachGoogleStub` for a real
`supabase.auth.signInWithOAuth({ provider: 'google' })` call.

## 6. Install npm dependencies

```bash
npm install
```

This installs:

- `@supabase/supabase-js` — core client
- `@supabase/ssr` — cookie-based session helpers (for Astro SSR)
- `@astrojs/node@^10` — Node SSR adapter (required because we now
  read cookies in middleware). The v9 line only supports Astro 5;
  v10 is the line that pairs with Astro 6.

## 7. Run the dev server

```bash
npm run dev
```

Astro 6 has SSR enabled (`output: 'server'`) and runs the Node
adapter in dev. Open <http://localhost:4321> and try the **Sign up**
flow.

## 8. Build & deploy

```bash
npm run build      # produces dist/
npm run start      # node ./dist/server/entry.mjs (port 4321 by default)
```

When deploying to a real host (Fly, Render, Vercel, etc.):

- Set the four env vars in the host's dashboard.
- Point Supabase **Authentication → URL Configuration → Site URL**
  at your production origin.
- Add `https://your-domain.com/auth/callback` to **Redirect URLs**.

---

## How the pieces fit together

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser                                                           │
│                                                                    │
│   /login, /signup, /forgot-password                               │
│     └─► <script> src/scripts/auth-form.ts                         │
│           └─► getBrowserSupabase() (@supabase/ssr)                 │
│                 └─► supabase.auth.signIn / signUp / resetPassword  │
│                                                                    │
│   Layout pre-paint script                                          │
│     └─► reads `sl-session` cookie (mirror)                         │
│         — decides guest-only / protected redirect                  │
└────────────────────────────────────────────────────────────────────┘
                              │  HTTP + cookies
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  Astro server (Node)                                               │
│                                                                    │
│   src/middleware.ts                                                │
│     └─► getSupabase(Astro)                                         │
│           └─► supabase.auth.getUser()   (refreshes the session)    │
│                 └─► loads public.users / *_profiles                │
│                       └─► writes the `sl-session` mirror cookie    │
│                                                                    │
│   Page frontmatter                                                 │
│     └─► Astro.locals.user / .role / .studentProfile / ...          │
│                                                                    │
│   /auth/callback  — exchanges OAuth / magic-link code              │
│   /auth/signout   — server-side sign-out (clears cookies)          │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  Supabase (Postgres + Auth)                                        │
│                                                                    │
│   auth.users                  (managed by Supabase)                │
│      │ on insert                                                ▼ │
│      └──► public.users                                              │
│             └──► public.student_profiles | public.company_profiles  │
│                                                                    │
│   public.jobs          (RLS: open to all, write = owner)            │
│   public.applications  (RLS: read = applicant OR job owner)         │
└────────────────────────────────────────────────────────────────────┘
```

### Why a mirror cookie (`sl-session`)?

Astro's `<head>` inline pre-paint redirect script (in
`src/layouts/Layout.astro` and `src/layouts/DashboardLayout.astro`)
runs **before** any module loads, so it cannot import the Supabase
client. The middleware writes a non-HTTP-only cookie on every
request containing the public session payload, and the inline script
reads that cookie to decide where to redirect. The real Supabase
session is still validated server-side on the same request.

### What stays local for now

- `src/scripts/store.ts` — the original `localStorage` mock. It's
  still used as a **fallback** by `auth-guards.ts` and `session-bar.ts`
  so legacy pages that haven't been ported keep working. New code
  should read from `src/lib/types.ts::AppSession` and rely on the
  Supabase-backed middleware.

---

## Files created

```
.env                                       (local only — gitignored)
.env.example
supabase/migrations/0001_initial_schema.sql
src/lib/env.ts
src/lib/supabase.ts
src/lib/supabase-browser.ts
src/lib/types.ts
src/middleware.ts
src/pages/auth/callback.astro
src/pages/auth/signout.astro
BACKEND_SETUP.md                           (this file)
```

## Files modified

```
package.json              — added @supabase/ssr, @supabase/supabase-js, @astrojs/node
astro.config.mjs          — added node adapter, output: 'server'
src/scripts/auth-form.ts  — submit handler now calls Supabase
src/scripts/auth-guards.ts — reads AppSession from new mirror key
src/scripts/session-bar.ts — signOut() calls Supabase, then redirects
src/layouts/DashboardLayout.astro — "Switch account" uses new signOut()
```

## No design changes

The auth pages, dashboards, and avatar menu render **identically** to
before. The pre-paint redirect script, validation, password strength
meter, and toast handoff are all preserved.

---

## Troubleshooting

**`supabase.auth.getUser()` returns null on a fresh sign-in.**
Make sure the `public.users` insert trigger (in
`0001_initial_schema.sql`) ran. Check **Database → Tables → users** in
the Supabase dashboard. If the row is missing, paste the trigger
block from the migration into a new SQL query and re-run it.

**`Invalid API key` errors in the browser.**
You forgot to fill in `.env`, or the `astro dev` server was started
before you edited it. Restart `npm run dev` after editing `.env`.

**Cookies not persisting across reloads in Chrome on `http://`.**
That's expected — the `Secure` cookie flag is off in dev. If you
want to test `Secure` cookies locally, run behind a TLS-terminating
proxy (e.g. `caddy reverse-proxy`).

**`redirect URL not in allowlist` for the OAuth callback.**
Add the callback URL to **Authentication → URL Configuration →
Redirect URLs** in the Supabase dashboard.

**Migrations fail with `permission denied`.**
The Supabase service role key has full access. Make sure the `supabase
db push` command is using the correct project (run `supabase link` to
re-link).

---

## What to build next

Now that auth works, the natural next step is to back the existing
localStorage-backed features with real Supabase tables:

1. **Wire `/jobs/post` to `public.jobs`** — replace `store.briefs.create`
   with a Supabase insert.
2. **Wire `/student/find-work` to `public.jobs`** — query with the
   same skill / budget / recency filters you have today.
3. **Wire applications to `public.applications`** — `apply-form.ts`,
   `applicants.ts`, and `company/hires.astro` all read/write
   applications.

The RLS policies in `0001_initial_schema.sql` already enforce that
only the right parties can read or write each row — you can ship
those features without a separate authz layer.
