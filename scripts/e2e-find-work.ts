/**
 * scripts/e2e-find-work.ts
 *
 * End-to-end smoke test for the /student/find-work listing now that
 * it reads from public.jobs. Drives a live Astro server (port 4321
 * by default) and the real Supabase project.
 *
 *   1. Sign up a company (trigger seeds company_profiles).
 *   2. POST /api/jobs with a distinctive, unique-in-this-run title.
 *   3. GET /student/find-work and confirm the brief title appears
 *      in the rendered HTML, with the right category / budget /
 *      skills data attributes.
 *   4. GET /jobs/{id} and confirm the same brief renders on the
 *      detail page.
 *   5. Clean up.
 *
 * Assumes the dev server is already running. Run with:
 *
 *   node --env-file=.env --import tsx scripts/e2e-find-work.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = process.env.PORT ?? '4321';
const BASE = `http://localhost:${PORT}`;
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

interface Cookies {
  jar: Map<string, string>;
  cookieHeader(): string;
  applySetCookies(res: Response): void;
}
function newCookies(): Cookies {
  const jar = new Map<string, string>();
  return {
    jar,
    cookieHeader() {
      return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    },
    applySetCookies(res: Response) {
      const raw = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      for (const sc of raw) {
        const pair = sc.split(';')[0];
        if (!pair) continue;
        const [k, ...v] = pair.split('=');
        if (k && v.length) jar.set(k.trim(), v.join('=').trim());
      }
    },
  };
}

async function authedFetch(url: string, init: RequestInit & { cookies: Cookies }): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', init.cookies.cookieHeader());
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  init.cookies.applySetCookies(res);
  return res;
}

async function signUp(cookies: Cookies, email: string, password: string, name: string, role: 'student' | 'company') {
  const ssr = createServerClient(SUPABASE_URL, ANON, {
    cookies: {
      get(name) { return cookies.jar.get(name); },
      set(name, value) { cookies.jar.set(name, value); },
      remove(name) { cookies.jar.delete(name); },
    },
  });
  const { data, error } = await ssr.auth.signUp({
    email,
    password,
    options: { data: { role, name } },
  });
  if (error) fail(`signup(${email}) failed: ${error.message}`);
  if (!data.user) fail(`signup(${email}) returned no user`);
  return data.user.id;
}

async function main() {
  if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
    fail('Fill in .env first.');
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stamp = Date.now();
  const email = `e2e-fw-co+${stamp}@example.com`;
  const password = 'E2EFindWork!2026';
  // A unique, memorable title so the test can grep the rendered HTML.
  const uniqueTitle = `ZEBRA-E2E-BRIEF-${stamp}`;
  const uniqueSummary = `Hand-rolled summary ${stamp}.`;

  console.log(`\n— Find Work e2e (${stamp}) —`);
  console.log(`  company: ${email}`);
  console.log(`  title:   ${uniqueTitle}\n`);

  // ---- 0. Server reachable --------------------------------------
  try {
    const probe = await fetch(`${BASE}/student/find-work`);
    if (!probe.ok) fail(`server at ${BASE} returned HTTP ${probe.status}`);
  } catch (err) {
    fail(`server at ${BASE} is not reachable: ${(err as Error).message}`);
  }
  ok(`server reachable at ${BASE}`);

  // ---- 1. Sign up the company + post a brief -------------------
  const companyCookies = newCookies();
  const companyUserId = await signUp(companyCookies, email, password, 'Find Work E2E', 'company');
  ok(`signed up company ${companyUserId}`);

  const postRes = await authedFetch(`${BASE}/api/jobs`, {
    method: 'POST',
    cookies: companyCookies,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: uniqueTitle,
      category: 'web-development',
      summary: uniqueSummary,
      description: 'This is a long enough description for the find-work end-to-end test. '.repeat(4),
      budgetType: 'fixed',
      budget: 750,
      duration: '2weeks',
      hours: '5-10',
      skills: ['TypeScript', 'Astro', 'Supabase'],
    }),
  });
  if (postRes.status !== 201) {
    fail(`/api/jobs returned HTTP ${postRes.status}: ${await postRes.text()}`);
  }
  const postBody = (await postRes.json()) as { id: string };
  const jobId = postBody.id;
  ok(`posted brief ${jobId.slice(0, 8)}…`);

  // ---- 2. GET /student/find-work and confirm the brief shows up -
  const listRes = await fetch(`${BASE}/student/find-work`);
  if (!listRes.ok) fail(`/student/find-work returned HTTP ${listRes.status}`);
  const listHtml = await listRes.text();

  if (!listHtml.includes(uniqueTitle)) {
    fail(`/student/find-work HTML did not contain the unique brief title "${uniqueTitle}"`);
  }
  ok(`/student/find-work renders the new brief (title "${uniqueTitle}")`);

  // Confirm the data attribute shape that the client filter pass reads.
  // The card is rendered as <li data-fw-item data-fw-id="…" data-fw-cat="web-development" …>.
  if (!listHtml.includes(`data-fw-id="${jobId}"`)) {
    fail(`/student/find-work did not include data-fw-id="${jobId}" for the new brief`);
  }
  if (!listHtml.includes('data-fw-cat="web-development"')) {
    fail('/student/find-work did not include data-fw-cat="web-development"');
  }
  if (!listHtml.includes('data-fw-budget="fixed"')) {
    fail('/student/find-work did not include data-fw-budget="fixed"');
  }
  if (!listHtml.includes('TypeScript') || !listHtml.includes('Astro')) {
    fail('/student/find-work did not render the brief skills');
  }
  ok('data attributes + skills render on the listing');

  // The "Remote" chip is always shown for Supabase-backed briefs.
  if (!listHtml.includes('Remote')) {
    fail('/student/find-work did not render the Remote chip');
  }
  ok('Remote chip renders for the new brief');

  // ---- 3. Confirm the budget label is correct ------------------
  if (!listHtml.includes('$750')) {
    fail('/student/find-work did not render the $750 budget label');
  }
  ok('budget label ($750 fixed) renders correctly');

  // ---- 4. GET /jobs/{id} and confirm the detail page renders ----
  const detailRes = await fetch(`${BASE}/jobs/${jobId}`);
  if (detailRes.status !== 200) {
    fail(`/jobs/${jobId} returned HTTP ${detailRes.status}`);
  }
  const detailHtml = await detailRes.text();
  if (!detailHtml.includes(uniqueTitle)) {
    fail(`/jobs/${jobId} did not render the brief title "${uniqueTitle}"`);
  }
  if (!detailHtml.includes(uniqueSummary)) {
    fail(`/jobs/${jobId} did not render the brief summary "${uniqueSummary}"`);
  }
  // The apply CTA must link to /jobs/{id}/apply.
  if (!detailHtml.includes(`/jobs/${jobId}/apply`)) {
    fail(`/jobs/${jobId} did not include a link to /jobs/${jobId}/apply`);
  }
  ok(`/jobs/${jobId} renders the new brief (title, summary, apply CTA)`);

  // ---- 5. Confirm RLS hides the brief once it's filled ----------
  // Hire a placeholder student (sign up + apply + hire) so the
  // brief is closed. Then refetch the listing and confirm the
  // title is gone.
  const studentCookies = newCookies();
  const studentEmail = `e2e-fw-st+${stamp}@example.com`;
  const studentUserId = await signUp(studentCookies, studentEmail, password, 'Find Work E2E Student', 'student');
  ok(`signed up student ${studentUserId} (for the close-the-brief check)`);

  const applyRes = await authedFetch(`${BASE}/api/applications`, {
    method: 'POST',
    cookies: studentCookies,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId,
      cover: 'I would love to take this brief. I have done this many times before. '.repeat(3).trim(),
      rate: 50,
      timeline: '1 week',
      portfolio: 'https://example.com/portfolio',
    }),
  });
  if (applyRes.status !== 201) fail(`apply returned HTTP ${applyRes.status}: ${await applyRes.text()}`);
  const applyBody = (await applyRes.json()) as { id: string };

  const hireRes = await authedFetch(
    `${BASE}/api/applications?id=${encodeURIComponent(applyBody.id)}`,
    {
      method: 'PATCH',
      cookies: companyCookies,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'hired' }),
    },
  );
  if (hireRes.status !== 200) fail(`hire returned HTTP ${hireRes.status}: ${await hireRes.text()}`);
  ok('student applied and was hired (brief is now status=filled)');

  // Refetch the listing — the brief should be gone (RLS hides non-open).
  const listRes2 = await fetch(`${BASE}/student/find-work`);
  const listHtml2 = await listRes2.text();
  if (listHtml2.includes(uniqueTitle)) {
    fail('hired brief still appears in /student/find-work (RLS did not hide it)');
  }
  ok('hired brief correctly hidden from /student/find-work');

  // And the detail page should render the fallback stub.
  const detailRes2 = await fetch(`${BASE}/jobs/${jobId}`);
  const detailHtml2 = await detailRes2.text();
  if (!detailHtml2.includes('Brief not found') && !detailHtml2.includes('no longer available')) {
    fail('closed brief detail page should show the "Brief not found" stub');
  }
  ok('closed brief detail page renders the not-found stub');

  // ---- 6. Clean up ---------------------------------------------
  for (const id of [companyUserId, studentUserId]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`! could not delete ${id}: ${error.message}`);
    else ok(`cleaned up user ${id.slice(0, 8)}…`);
  }
  await new Promise((r) => setTimeout(r, 250));
  const { data: stillThere } = await admin
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .maybeSingle();
  if (stillThere) {
    fail(`jobs row ${jobId} still exists after deleteUser()`);
  } else {
    ok('jobs row removed after cleanup (FK cascade)');
  }

  console.log('\n✅ all find-work end-to-end checks passed\n');
}

main().catch((err) => {
  fail(err instanceof Error ? err.stack ?? err.message : String(err));
});
