/**
 * supabase-browser
 *
 * Browser-side Supabase client. Imported by client scripts (the
 * `<script>` tag in pages) to sign users in / out, read the current
 * session, and listen for auth events.
 *
 * We deliberately reuse the same cookie names as the server client so
 * sign-in propagates instantly without a hard navigation.
 */

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from './env';

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (_client) return _client;
  _client = createBrowserClient(
    publicEnv.PUBLIC_SUPABASE_URL,
    publicEnv.PUBLIC_SUPABASE_ANON_KEY,
  );
  return _client;
}
