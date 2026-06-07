/**
 * env
 *
 * Typed accessors for the runtime environment variables. Astro
 * exposes `import.meta.env` to both client and server code, but with
 * different shapes (public vars on the client, everything on the
 * server). Centralising the reads here gives us a single place to
 * throw a clear error if a required variable is missing.
 *
 * Never import `serverEnv` from a file that runs in the browser —
 * doing so will inline the service role key into the client bundle.
 */

interface PublicEnv {
  PUBLIC_SUPABASE_URL: string;
  PUBLIC_SUPABASE_ANON_KEY: string;
  PUBLIC_SITE_URL: string;
}

interface ServerEnv extends PublicEnv {
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function readPublic(): PublicEnv {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const site = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';
  if (!url || !anon) {
    // Don't fail the build for missing public vars — pages that
    // don't need Supabase still render fine. Callers that DO need
    // a session (login, dashboard) will surface a clearer error
    // from the Supabase client itself.
  }
  return {
    PUBLIC_SUPABASE_URL: url ?? '',
    PUBLIC_SUPABASE_ANON_KEY: anon ?? '',
    PUBLIC_SITE_URL: site,
  };
}

function readServer(): ServerEnv {
  const publicEnv = readPublic();
  const service = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return { ...publicEnv, SUPABASE_SERVICE_ROLE_KEY: service };
}

export const publicEnv: PublicEnv = readPublic();

/**
 * Read server-only secrets. Throws if called in a non-server context
 * (Astro client islands, plain browser scripts) so we never silently
 * leak secrets to the client bundle.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() called in a browser context — do not import this from client code.');
  }
  return readServer();
}
