/**
 * POST /api/applications
 *
 * Insert a new application into public.applications. Student role
 * only. The job id comes from the body; the applicant id is the
 * signed-in user.
 *
 * PATCH /api/applications?id=...
 *
 * Update an application's status (shortlist / hire / reject). Company
 * role only. The hire transition auto-rejects the other open
 * applications on the same brief and closes the brief.
 */
import type { APIRoute } from 'astro';
import {
  ApiError,
  createApplication,
  setApplicationStatus,
} from '../../lib/api';
import type { ApplicationStatus } from '../../lib/types';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    const jobId = String(body.jobId ?? '').trim();
    if (!jobId) throw new ApiError('Missing jobId.', 400, 'missing_job_id');
    const application = await createApplication(context, {
      jobId,
      cover: String(body.cover ?? '').trim(),
      rateCents:
        typeof body.rate === 'number' && Number.isFinite(body.rate)
          ? Math.round(body.rate * 100)
          : null,
      timeline: typeof body.timeline === 'string' ? body.timeline : null,
      portfolioUrl: typeof body.portfolio === 'string' ? body.portfolio : null,
    });
    return new Response(JSON.stringify({ ok: true, id: application.id, application }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(err);
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const id = context.url.searchParams.get('id');
    if (!id) throw new ApiError('Missing id query param.', 400, 'missing_id');
    const body = (await context.request.json()) as Record<string, unknown>;
    const status = String(body.status ?? '') as ApplicationStatus;
    if (!['new', 'shortlisted', 'hired', 'rejected'].includes(status)) {
      throw new ApiError('Invalid status.', 400, 'invalid_status');
    }
    const result = await setApplicationStatus(context, id, status);
    return new Response(
      JSON.stringify({
        ok: true,
        application: result.application,
        autoRejected: result.autoRejected,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
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
