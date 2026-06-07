/**
 * POST /api/jobs
 *
 * Insert a new brief into public.jobs. The session middleware has
 * already validated the JWT; the row's owner_id is the signed-in
 * user's id (NOT whatever the client posts — RLS will reject any
 * mismatch).
 */
import type { APIRoute } from 'astro';
import { ApiError, createJob } from '../../lib/api';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    const skills = Array.isArray(body.skills) ? (body.skills as string[]).filter(Boolean) : [];
    if (skills.length < 3) {
      throw new ApiError('Add at least 3 skills.', 400, 'skills_too_few');
    }
    const budget = Number(body.budget);
    if (!Number.isFinite(budget) || budget < 20) {
      throw new ApiError('Minimum budget is $20.', 400, 'budget_too_low');
    }
    const job = await createJob(context, {
      title: String(body.title ?? '').trim(),
      category: String(body.category ?? '').trim(),
      summary: String(body.summary ?? '').trim(),
      description: String(body.description ?? '').trim(),
      budgetType: body.budgetType === 'hourly' ? 'hourly' : 'fixed',
      budgetCents: Math.round(budget * 100),
      duration: String(body.duration ?? '').trim(),
      hours: String(body.hours ?? '').trim(),
      skills,
      links: typeof body.links === 'string' && body.links.trim() ? body.links.trim() : null,
    });
    return new Response(JSON.stringify({ ok: true, id: job.id, job }), {
      status: 201,
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
