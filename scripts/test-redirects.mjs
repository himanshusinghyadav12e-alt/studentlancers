/**
 * Production-build smoke test for TASK 4A — guest access & login redirects.
 *
 * Run against `npm run preview` (port 4330 by default).
 */
import { chromium } from 'playwright';
import { setTimeout as wait } from 'node:timers/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4330';
const STUDENT = { email: 'student@university.edu', password: 'student123' };
const COMPANY = { email: 'hire@linearlabs.com', password: 'company123' };

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? '✅' : '❌';
  console.log(`${tag} ${name}${detail ? '  — ' + detail : ''}`);
}

async function freshContext(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

async function loginAs(page, account) {
  const here = page.url();
  if (!here.endsWith('/login') && !here.includes('/login?')) {
    await page.goto(`${BASE}/login`);
  }
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 5000 });
  await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
  await wait(300);
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. Guest clicks "Find work" on the homepage
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/`);
      await page.click('a.nav__link:has-text("Find work")');
      await wait(500);
      const url = new URL(page.url());
      record(
        'Guest clicks "Find work" → /login?next=/student/find-work',
        url.pathname === '/login' && url.searchParams.get('next') === '/student/find-work',
        page.url(),
      );
      await ctx.close();
    }

    // 2. Guest clicks "Post a brief" on the homepage
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/`);
      await page.click('a.nav__link:has-text("Post a brief")');
      await wait(500);
      const url = new URL(page.url());
      record(
        'Guest clicks "Post a brief" → /login?next=/jobs/post',
        url.pathname === '/login' && url.searchParams.get('next') === '/jobs/post',
        page.url(),
      );
      await ctx.close();
    }

    // 3. Guest deep-links /student/find-work
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/student/find-work`);
      await wait(500);
      const url = new URL(page.url());
      record(
        'Guest deep-links /student/find-work → /login?next=/student/find-work',
        url.pathname === '/login' && url.searchParams.get('next') === '/student/find-work',
        page.url(),
      );
      await ctx.close();
    }

    // 4. Guest deep-links /jobs/post
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/jobs/post`);
      await wait(500);
      const url = new URL(page.url());
      record(
        'Guest deep-links /jobs/post → /login?next=/jobs/post',
        url.pathname === '/login' && url.searchParams.get('next') === '/jobs/post',
        page.url(),
      );
      await ctx.close();
    }

    // 5. Guest deep-links /student/dashboard
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/student/dashboard`);
      await wait(500);
      const url = new URL(page.url());
      record(
        'Guest deep-links /student/dashboard → /login?next=/student/dashboard',
        url.pathname === '/login' && url.searchParams.get('next') === '/student/dashboard',
        page.url(),
      );
      await ctx.close();
    }

    // 6. Student signs in from /login?next=/student/find-work
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/login?next=/student/find-work`);
      const notice = await page.locator('[data-next-notice]').count();
      record(
        'Login page with ?next= shows "Sign in to continue" notice',
        notice === 1,
        `notices=${notice}`,
      );
      await loginAs(page, STUDENT);
      record(
        'Student login from ?next=/student/find-work → /student/find-work',
        page.url() === `${BASE}/student/find-work`,
        page.url(),
      );
      await ctx.close();
    }

    // 7. Student tries /company/dashboard
    {
      const { ctx, page } = await freshContext(browser);
      await loginAs(page, STUDENT);
      await page.goto(`${BASE}/company/dashboard`);
      await wait(500);
      record(
        'Student deep-links /company/dashboard → /student/dashboard',
        page.url() === `${BASE}/student/dashboard`,
        page.url(),
      );
      await ctx.close();
    }

    // 8. Signed-in student visits /login
    {
      const { ctx, page } = await freshContext(browser);
      await loginAs(page, STUDENT);
      await page.goto(`${BASE}/login`);
      await wait(500);
      record(
        'Signed-in student visits /login → /student/dashboard',
        page.url() === `${BASE}/student/dashboard`,
        page.url(),
      );
      await ctx.close();
    }

    // 9. Company signs in from /login?next=/jobs/post
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/login?next=/jobs/post`);
      await loginAs(page, COMPANY);
      record(
        'Company login from ?next=/jobs/post → /jobs/post',
        page.url() === `${BASE}/jobs/post`,
        page.url(),
      );
      await ctx.close();
    }

    // 10. Company tries /student/find-work
    {
      const { ctx, page } = await freshContext(browser);
      await loginAs(page, COMPANY);
      await page.goto(`${BASE}/student/find-work`);
      await wait(500);
      record(
        'Company deep-links /student/find-work → /company/dashboard',
        page.url() === `${BASE}/company/dashboard`,
        page.url(),
      );
      await ctx.close();
    }

    // 11. Open-redirect attempt
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/login?next=//evil.com`);
      await loginAs(page, STUDENT);
      const url = new URL(page.url());
      record(
        'Open-redirect attempt ?next=//evil.com → role dashboard',
        url.pathname === '/student/dashboard',
        page.url(),
      );
      await ctx.close();
    }

    // 12. Loop attempt
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/login?next=/login`);
      await loginAs(page, STUDENT);
      const url = new URL(page.url());
      record(
        'Loop attempt ?next=/login → role dashboard',
        url.pathname === '/student/dashboard',
        page.url(),
      );
      await ctx.close();
    }

    // 13. Banner copy
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/login?next=/student/find-work`);
      const text = await page.locator('[data-next-notice] .auth-alert__msg').textContent();
      record(
        'Banner copy mentions "Find work" for /student/find-work',
        !!text && text.includes('Find work'),
        text ?? '',
      );
      await ctx.close();
    }

    // 14. Company deep-links /jobs/post and then logs in
    {
      const { ctx, page } = await freshContext(browser);
      await page.goto(`${BASE}/jobs/post`);
      await wait(500);
      const url = new URL(page.url());
      record(
        'Guest deep-links /jobs/post → /login?next=/jobs/post (post.astro)',
        url.pathname === '/login' && url.searchParams.get('next') === '/jobs/post',
        page.url(),
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
})();
