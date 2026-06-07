/**
 * POST /api/company-profile
 *
 * Upsert the signed-in company's profile into public.company_profiles
 * (and public.users.name, if the caller passed a new display name).
 * Used by the /company/profile editor.
 */
import type { APIRoute } from 'astro';
import { ApiError, upsertCompanyProfile } from '../../lib/api';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    const profile = await upsertCompanyProfile(context, {
      name: typeof body.name === 'string' ? body.name : undefined,
      website: typeof body.website === 'string' ? body.website : null,
      industry: typeof body.industry === 'string' ? body.industry : null,
      size: typeof body.size === 'string' ? body.size : null,
      logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : null,
      blurb: typeof body.blurb === 'string' ? body.blurb : null,
    });
    return new Response(JSON.stringify({ ok: true, profile }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(err);
  }
};

function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return new Response(JSON.stringify({ ok: false, error: err.message, code: err.code }), {
      status: err.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error.';
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  });
}
