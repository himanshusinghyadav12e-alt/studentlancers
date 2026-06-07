/**
 * apply-form
 *
 * Client-side wiring for /jobs/[id]/apply:
 *   - Inline + form-level validation
 *   - Loading state on submit
 *   - Success state with a generated application id
 *   - Per-brief draft autosave to localStorage so a refresh or
 *     accidental Back doesn't lose what the student typed
 *   - beforeunload guard when the draft is dirty, so the browser
 *     asks before navigating away
 */

const VALIDATORS: Record<string, (value: string) => string | null> = {
  cover(value) {
    const v = value.trim();
    if (!v) return 'Add a short cover letter.';
    if (v.length < 80) return `Add at least 80 characters (currently ${v.length}).`;
    if (v.length > 2000) return 'Keep the cover letter under 2000 characters.';
    return null;
  },
  rate(value) {
    const n = Number(value);
    if (!value) return 'Set a rate.';
    if (!Number.isFinite(n) || n < 5) return 'Minimum is $5.';
    if (n > 1_000_000) return 'That rate looks too high — please double-check.';
    return null;
  },
  timeline(value) {
    const v = value.trim();
    if (!v) return 'Add a proposed timeline.';
    if (v.length < 2) return 'Add a bit more detail.';
    return null;
  },
  portfolio(value) {
    const v = value.trim();
    if (!v) return 'Add a portfolio link.';
    try {
      new URL(v);
    } catch {
      return 'Enter a full URL (e.g. https://…).';
    }
    return null;
  },
};

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

function setFieldError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  const fieldEl = field.closest('.ds-field') as HTMLElement | null;
  if (!fieldEl) return;
  fieldEl.querySelectorAll('.ds-field__error[data-apply-error]').forEach((n) => n.remove());
  const input = fieldEl.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ds-input');
  if (input) {
    input.classList.toggle('ds-input--error', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (message) {
    const p = document.createElement('p');
    p.className = 'ds-field__error';
    p.setAttribute('data-apply-error', '');
    p.setAttribute('role', 'alert');
    p.textContent = message;
    fieldEl.appendChild(p);
  }
}

function setFormAlert(alertEl: HTMLElement | null, message: string | null, title = 'Please review the form.') {
  if (!alertEl) return;
  if (!message) {
    alertEl.setAttribute('hidden', '');
    return;
  }
  alertEl.removeAttribute('hidden');
  const titleEl = alertEl.querySelector<HTMLElement>('[data-form-alert-title]');
  const msgEl = alertEl.querySelector<HTMLElement>('[data-form-alert-msg]');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
}

function clearAllErrors(form: HTMLFormElement) {
  form.querySelectorAll<HTMLElement>('.ds-field__error[data-apply-error]').forEach((n) => n.remove());
  form.querySelectorAll<HTMLElement>('.ds-input').forEach((input) => {
    input.classList.remove('ds-input--error');
    input.removeAttribute('aria-invalid');
  });
  setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), null);
}

function validateForm(form: HTMLFormElement): string | null {
  let firstInvalid: HTMLElement | null = null;
  let firstMessage = '';

  const fields = form.querySelectorAll<HTMLElement>('[data-field]');
  fields.forEach((fieldEl) => {
    const name = fieldEl.getAttribute('data-field') || '';
    let value = '';
    if (fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLTextAreaElement) {
      value = fieldEl.value;
    }
    const validator = name ? VALIDATORS[name] : null;
    const error = validator ? validator(value) : null;
    setFieldError(fieldEl, error);
    if (error) {
      if (!firstInvalid) {
        firstInvalid = fieldEl;
        firstMessage = error;
      }
    }
  });

  if (firstInvalid instanceof HTMLElement) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof firstInvalid.focus === 'function') firstInvalid.focus();
    return firstMessage;
  }
  return null;
}

function setLoading(form: HTMLFormElement, loading: boolean) {
  const submit = form.querySelector<HTMLElement>('[data-submit]');
  const label = form.querySelector<HTMLElement>('[data-submit-label]');
  if (submit) submit.setAttribute('data-loading', loading ? 'true' : 'false');
  if (label) {
    if (!label.dataset.original) label.dataset.original = label.textContent ?? '';
    label.textContent = loading ? 'Sending…' : (label.dataset.original ?? 'Send application');
  }
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button, select, textarea').forEach((el) => {
    el.toggleAttribute('disabled', loading);
  });
}

async function fakeSubmit(_data: FormData): Promise<{ ok: true; id: string }> {
  await new Promise((r) => setTimeout(r, 700));
  const id = 'APP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  return { ok: true, id };
}

import { store } from './store';
import { getJobById } from '../data/jobs';
import { toast } from './toast';

async function persistApplication(
  data: FormData,
  briefId: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  // Read from a snapshot taken before the form was disabled —
  // disabled fields are excluded from FormData.
  const session = store.auth.current();
  if (!session) {
    return { ok: false, message: 'You need to be signed in to apply.' };
  }
  if (session.role !== 'student') {
    return { ok: false, message: 'Only student accounts can apply to briefs.' };
  }
  const cover = String(data.get('cover') || '').trim();
  const rate = Number(data.get('rate') || 0);
  const timeline = String(data.get('timeline') || '').trim();
  const portfolio = String(data.get('portfolio') || '').trim();
  if (!cover || !timeline || !portfolio || !rate) {
    return { ok: false, message: 'Please fill in every required field.' };
  }
  const job = getJobById(briefId);
  const title = job ? job.title : briefId;
  const app = store.applications.create({
    briefId,
    briefTitle: title,
    applicantId: session.userId,
    applicantName: session.name,
    applicantEmail: session.email,
    cover,
    rate,
    timeline,
    portfolio,
  });
  return { ok: true, id: app.id };
}

export function mountApplyForm() {
  const form = document.querySelector<HTMLFormElement>('[data-apply-form]');
  if (!form) return;

  // Capture the brief id from the URL — the page is /jobs/[id]/apply
  // and the id param lives in window.location.pathname.
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  // ['jobs', '<id>', 'apply']
  const briefId = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : '';

  /* ─── Per-brief draft autosave ───────────────────────────────
   *
   * The form has no real submit endpoint yet, so a refresh or a
   * Back click would otherwise lose the cover letter, rate, and
   * portfolio link. Key the draft by brief id so applying to one
   * brief does not bleed into another. The draft is cleared the
   * moment a submission succeeds. */
  const DRAFT_KEY = `sl-apply-draft-v1:${briefId}`;
  let draftDirty = false;

  function readDraft(): Record<string, string> {
    const data = new FormData(form);
    const obj: Record<string, string> = {};
    for (const [k, v] of data.entries()) obj[k] = String(v);
    return obj;
  }

  function applyDraft(draft: Record<string, string>) {
    for (const [name, value] of Object.entries(draft)) {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (el && value) el.value = value;
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(readDraft()));
      draftDirty = true;
    } catch {
      // ignore quota / disabled storage
    }
  }

  const saveDraftDebounced = debounce(saveDraft, 250);

  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw) as Record<string, string>;
      if (draft && typeof draft === 'object') applyDraft(draft);
    }
  } catch {
    // ignore
  }

  form.addEventListener('input', saveDraftDebounced);
  form.addEventListener('change', saveDraftDebounced);

  // Browser-level guard: if the student is mid-application and tries
  // to navigate away, ask the browser to confirm. We do not block
  // the in-app "Back to brief" pill (it lives on this same page) and
  // we never block when the form is empty.
  const beforeUnload = (event: BeforeUnloadEvent) => {
    const empty = !readDraft().cover && !readDraft().rate && !readDraft().timeline && !readDraft().portfolio;
    if (empty || !draftDirty) return;
    event.preventDefault();
    // Modern browsers ignore the custom string; setting returnValue
    // is the documented way to trigger the prompt.
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAllErrors(form);
    const error = validateForm(form);
    if (error) {
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), error);
      return;
    }
    setLoading(form, true);
    try {
      // Capture the form values before setLoading disables every
      // field — disabled inputs are excluded from FormData.
      const data = new FormData(form);
      const result = await persistApplication(data, briefId);
      if (!result.ok) {
        setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), result.message);
        toast.error('Could not send application', result.message);
        setLoading(form, false);
        return;
      }
      const main = document.querySelector<HTMLElement>('.post-page');
      const success = document.querySelector<HTMLElement>('[data-success-state]');
      const idEl = document.querySelector<HTMLElement>('[data-success-id]');
      if (main) main.setAttribute('hidden', '');
      if (success) success.removeAttribute('hidden');
      if (idEl) idEl.textContent = result.id;
      // Submission succeeded — clear the draft and the unload guard
      // so a forward navigation does not trigger a "leave site?" prompt.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      draftDirty = false;
      window.removeEventListener('beforeunload', beforeUnload);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success(
        'Application sent',
        `${result.id} — most companies respond within 2 business days.`,
        4500,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), message);
      toast.error('Could not send application', message);
    } finally {
      setLoading(form, false);
    }
  });
}
