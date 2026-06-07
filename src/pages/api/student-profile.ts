/**
 * POST /api/student-profile
 *
 * Upsert the signed-in student's profile into public.student_profiles
 * (and public.users.name, if the caller passed a new display name).
 * Used by the /student/profile editor.
 */
import type { APIRoute } from 'astro';
import { ApiError, upsertStudentProfile } from '../../lib/api';

export const prerender = false;

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError('Request body must be valid JSON.', 400, 'invalid_json');
  }
}

export const POST: APIRoute = async (context) => {
  try {
    const body = (await readJson(context.request)) as Record<string, unknown>;
    const profile = await upsertStudentProfile(context, {
      name: typeof body.name === 'string' ? body.name : undefined,
      bio: typeof body.bio === 'string' ? body.bio : null,
      university: typeof body.university === 'string' ? body.university : null,
      major: typeof body.major === 'string' ? body.major : null,
      graduationYear:
        typeof body.graduationYear === 'number' ? body.graduationYear : null,
      hourlyRateCents:
        typeof body.hourlyRateCents === 'number' ? body.hourlyRateCents : null,
      skills: Array.isArray(body.skills) ? (body.skills as string[]).filter(Boolean) : [],
      portfolioUrl: typeof body.portfolioUrl === 'string' ? body.portfolioUrl : null,
      avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : null,
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
