# StudentLancers — Project Summary

> A marketplace where college students land real paid work and companies hire affordable, vetted talent.

This document is the source of truth for what the project does, how it's organized, and how to run it. The last big update was a complete audit + repair pass that wired every button, link, and form on the site.

---

## What it does

- **Two sides, one marketplace.** Students sign up to find paid gigs; companies sign up to post briefs and review applicants.
- **Static-first rendering.** Every page is pre-rendered HTML (Astro 6.4) so it's fast and crawlable. The interactive layer is a small localStorage-backed mock that simulates a backend until a real one ships.
- **Token-driven design.** Colors, type, spacing, and shadows all come from `src/styles/tokens.css` so dark mode is one attribute flip away.
- **Honest copy.** No fake statistics, no fabricated user counts, no review testimonials without attribution. Empty states are explicit.

---

## Stack

| | |
|---|---|
| Framework | Astro 6.4 (static output, no SSR) |
| Language | TypeScript + Astro components |
| Styles | Hand-written CSS, token-driven, no Tailwind |
| Fonts | Inter + JetBrains Mono (Google Fonts) |
| State | `localStorage` (mock), via `src/scripts/store.ts` |
| Build | `npm run build` (Vite under the hood) |
| Dev | `npm run dev` (Vite dev server) |

No external runtime dependencies beyond Astro itself. The "backend" is a single 250-line file that you can swap for `fetch()` calls.

---

## Project layout

```
src/
├── components/
│   ├── ui/                ← design-system primitives (Button, Card, Field, Input, Badge, ThemeToggle, ThemeBoot)
│   ├── SubPageShell.astro ← empty-state shell for dashboard sub-pages
│   └── Welcome.astro      ← (removed — was unused)
├── data/
│   └── jobs.ts            ← shared job catalog (12 seeded briefs)
├── layouts/
│   ├── Layout.astro       ← marketing / public pages
│   ├── AuthLayout.astro   ← /login, /signup, /forgot-password
│   ├── DashboardLayout.astro ← /student/* and /company/* dashboards
│   └── InfoLayout.astro   ← /pricing, /about, /terms, /privacy, etc.
├── pages/
│   ├── index.astro        ← marketing homepage
│   ├── login.astro · signup.astro · forgot-password.astro
│   ├── contact.astro · pricing.astro · about.astro
│   ├── terms.astro · privacy.astro · security.astro · cookies.astro · changelog.astro
│   ├── student/
│   │   ├── dashboard.astro · find-work.astro
│   │   ├── applications.astro · earnings.astro · reviews.astro
│   │   └── profile.astro · settings.astro
│   ├── company/
│   │   ├── dashboard.astro · applicants.astro
│   │   ├── hires.astro · billing.astro · profile.astro · settings.astro
│   ├── jobs/
│   │   ├── post.astro
│   │   ├── [id]/index.astro
│   │   └── [id]/apply.astro
├── scripts/
│   ├── store.ts           ← localStorage-backed mock auth + briefs + applications
│   ├── auth-form.ts       ← login, signup, forgot-password wiring
│   ├── apply-form.ts      ← /jobs/[id]/apply
│   ├── post-form.ts       ← /jobs/post
│   ├── contact-form.ts    ← /contact
│   ├── session-bar.ts     ← session-aware nav + avatar dropdown
│   └── theme-toggle.ts    ← light/dark toggle
└── styles/
    ├── tokens.css         ← design tokens
    ├── global.css         ← base + global components (nav user, avatar menu, demo banner, alerts)
    ├── auth.css           ← auth-shell layout
    └── dashboard.css      ← dashboard layout
```

---

## Authentication flow

Everything goes through `src/scripts/store.ts` (`store.auth.*`). The store persists four keys in `localStorage`:

| Key | Shape |
|---|---|
| `sl-users` | `User[]` — `{ id, email, name, role, password, createdAt }` |
| `sl-session` | `Session \| null` — `{ userId, email, name, role, signedInAt }` |
| `sl-briefs` | `Brief[]` — user-posted briefs |
| `sl-applications` | `Application[]` — student applications |
| `sl-seeded-v1` | `'1'` — sentinel that prevents re-seeding |

### Demo accounts (seeded on first load)

| Email | Password | Role |
|---|---|---|
| `student@university.edu` | `student123` | Student ("Aria Mehta") |
| `hire@linearlabs.com` | `company123` | Company ("Daniel Park") |

A "Try a demo account" banner appears on `/login` and `/signup` — one click fills the form.

### End-to-end auth

1. **Sign up** → validates, creates user, sets `sl-session`, redirects by role.
2. **Log in** → validates against `sl-users`, sets session, redirects.
3. **Log out** → clears `sl-session`, redirects to `/`.
4. **Forgot password** → always succeeds for a well-formed email; resend works.
5. **Session awareness** — every page mounts `session-bar.ts`, which reads `store.auth.current()` and rewires any `[data-session-aware]` block to show a user chip + "Log out" button instead of "Sign up / Log in".

### Wiring a real backend later

Replace the body of `store.auth.{signIn, signUp, signOut, forgotPassword}` with `fetch()` calls. The Session shape is the contract; the rest of the UI never reaches into `localStorage` directly.

---

## Forms

Every form has validation, a loading state, a success state, and a form-level error alert.

| Form | Hook | Persists to | Notes |
|---|---|---|---|
| Login | `data-auth-form="login"` | `store.auth.signIn` | Demo-account banner |
| Sign up | `data-auth-form="signup"` | `store.auth.signUp` | Account-type radio (Student/Company) |
| Forgot password | `data-auth-form="forgot"` | `store.auth.forgotPassword` | Toggles request/success states |
| Contact | `data-contact-form` | (no backend) | 700ms simulated latency |
| Post a brief | `data-post-form` | `store.briefs.create` | Autosaves draft to `localStorage`; live preview sidebar |
| Apply | `data-apply-form` | `store.applications.create` | Reads `briefId` from URL |
| CTA email | `data-cta-form` | (deep-links) | Validates email, navigates to `/signup?email=…` |

---

## Pages (50 routes)

All routes return HTTP 200 in dev. All routes are pre-rendered in build.

### Marketing
`/` · `/login` · `/signup` · `/forgot-password` · `/contact` · `/pricing` · `/about` · `/terms` · `/privacy` · `/security` · `/cookies` · `/changelog`

### Student
`/student/dashboard` · `/student/find-work` · `/student/applications` · `/student/earnings` · `/student/reviews` · `/student/profile` · `/student/settings`

### Company
`/company/dashboard` · `/jobs/post` · `/company/applicants` · `/company/hires` · `/company/billing` · `/company/profile` · `/company/settings`

### Jobs (per brief)
`/jobs/[id]` · `/jobs/[id]/apply` (× 12 seeded briefs)

---

## Design system

### Tokens (`src/styles/tokens.css`)
- Colors (light + dark), type scale, spacing scale, radii, shadows, motion.

### Primitives (`src/components/ui/`)
- **Button** — `primary`, `secondary`, `primary-sm`, `secondary-sm`, `ghost`, `tab`, `danger` × `md`/`lg`. Renders `<a>` if `href` is given, `<button>` otherwise.
- **Card** — `marketing`, `marketing-large`, `soft`, `template`, `pricing`, `pricing-featured`. Optional `href` makes the whole card a link.
- **Field** + **Input** — token-styled form primitives.
- **Badge** — `success`, `cyan`, `violet`, `secondary`, etc.
- **ThemeBoot** / **ThemeToggle** — dark-mode support with no-flash boot.

### Conventions
- Every page renders its own `ds-container` (max 1200 px) for content width.
- All interactive surfaces use the design system — no inline styles in JSX.
- Dark mode is one attribute (`html[data-theme="dark"]`); tokens flip.

---

## Running it

```bash
# Install
npm install

# Dev (hot reload, localhost:4321)
npm run dev

# Production build (50 static pages)
npm run build

# Preview the build
npm run preview
```

---

## What was changed in the audit + repair pass

The previous version of the site had 30+ placeholder `href="#"` links, 0 forms that actually persisted, 0 real auth, and 0 sub-pages for the dashboard nav. The pass fixed all of it.

**Added (24 files):**
- `src/scripts/store.ts` — localStorage mock backend
- `src/scripts/session-bar.ts` — session-aware nav + avatar menu
- `src/scripts/contact-form.ts` — contact form wiring
- `src/components/SubPageShell.astro` — empty-state shell
- `src/layouts/InfoLayout.astro` — shared layout for /pricing, /about, etc.
- `src/pages/contact.astro` · `pricing.astro` · `about.astro` · `terms.astro` · `privacy.astro` · `security.astro` · `cookies.astro` · `changelog.astro`
- `src/pages/student/applications.astro` · `earnings.astro` · `reviews.astro` · `profile.astro` · `settings.astro`
- `src/pages/company/applicants.astro` · `hires.astro` · `billing.astro` · `profile.astro` · `settings.astro`

**Modified (15 files):**
- `src/scripts/{auth-form, apply-form, post-form}.ts` — wired to the store, real persistence, error/success paths exercised
- `src/layouts/{Layout, AuthLayout, DashboardLayout}.astro` — mount `session-bar`; "Switch account" actually logs out; auth footer links resolve
- `src/pages/index.astro` — every CTA goes somewhere real; footer links resolved
- `src/pages/{login, signup, forgot-password}.astro` — demo-account banner; `?email=…` deep-link; Terms/Privacy link to real pages
- `src/pages/student/dashboard.astro` — real greeting, real application count, real recent items
- `src/pages/company/dashboard.astro` — real posted-brief count, real applicant count, real recent briefs
- `src/pages/jobs/{post, [id]/apply}.astro` — top-nav links resolved, success-state buttons go to real places
- `src/styles/global.css` — added `ds-nav-user`, `ds-avatar-menu`, `auth-demo-banner`, `alert` styles

**Removed:**
- `src/components/Welcome.astro` — unused

**Result:** every button does something, every link goes somewhere, every form persists (or simulates a successful submit), and the dev server returns HTTP 200 on every route with zero console errors.

---

## What's intentionally not built

- **Real backend.** `store.ts` is a mock. Swap the four `signIn` / `signUp` / `signOut` / `forgotPassword` bodies for `fetch()` when the API ships; nothing else needs to change.
- **Google sign-in.** Stub button that surfaces a friendly alert. Marked clearly in the UI.
- **Profile / Settings / Billing / Earnings editors.** Render honest empty states with copy explaining what will live there. Adding the full editors is its own project.
- **Self-hosted fonts.** Still loads Inter / JetBrains Mono from Google Fonts. Easy to swap when a privacy / perf budget demands it.

---

## License

UNLICENSED — internal StudentLancers project. All rights reserved.
