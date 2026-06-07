// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// https://astro.build/config
//
// SSR is enabled so we can read the Supabase session from request
// cookies and run server-side redirects. The Node adapter in
// `standalone` mode produces a self-contained server entry we can run
// with `node ./dist/server/entry.mjs` (see the `start` script in
// package.json). For local dev, `astro dev` continues to work without
// the adapter.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
