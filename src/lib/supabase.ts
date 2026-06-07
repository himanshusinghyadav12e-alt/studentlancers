/**
 * supabase (server)
 *
 * Build a Supabase client that reads/writes auth cookies on the
 * current request. The client is rebuilt per-request so we never
 * share a session across users.
 *
 * Usage in a .astro frontmatter:
 *
 *   ---
 *   import { getSupabase } from '../lib/supabase';
 *   const supabase = getSupabase(Astro);
 *   const { data: { user } } = await supabase.auth.getUser();
 *   ---
 *
 * Usage in middleware:
 *
 *   import { getSupabase } from './lib/supabase';
 *   const supabase = getSupabase(context);
 */

import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import type { AstroGlobal } from 'astro';
import type { APIContext, MiddlewareHandler } from 'astro';
import { publicEnv } from './env';

/**
 * `RequestContext` is the minimum surface we need from Astro to read
 * cookies and headers. Both `Astro` (inside a page) and `APIContext`
 * (in a middleware/API route) satisfy it.
 */
interface RequestContext {
  request: Request;
  cookies: APIContext['cookies'];
}

function cookieOptions(): CookieOptionsWithName[] {
  const isProd = publicEnv.PUBLIC_SITE_URL.startsWith('https://');
  return [
    {
      name: 'sb-access-token',
      // Lax so the session survives normal navigations; Secure only
      // over HTTPS.
      httpOnly: false,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
    },
    {
      name: 'sb-refresh-token',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
    },
  ];
}

export function getSupabase(context: RequestContext) {
  return createServerClient(
    publicEnv.PUBLIC_SUPABASE_URL,
    publicEnv.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: cookieOptions(),
      cookies: {
        get(name: string) {
          return context.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          context.cookies.set(name, value, options as Parameters<typeof context.cookies.set>[2]);
        },
        remove(name: string, options: Record<string, unknown>) {
          context.cookies.delete(name, options as Parameters<typeof context.cookies.delete>[1]);
        },
      },
    },
  );
}

/** Convenience alias used by Astro frontmatter. */
export function getSupabaseFromAstro(astro: AstroGlobal) {
  return getSupabase(astro);
}

/** A no-op middleware factory exported for symmetry. */
export const _middleware: MiddlewareHandler = async (_context, next) => next();
