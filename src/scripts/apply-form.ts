/**
 * apply-form
 *
 * Client-side wiring for /jobs/[id]/apply:
 *   - Inline + form-level validation
 *   - Loading state on submit
 *   - Success state with a generated application id
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
        setLoading(form, false);
        return;
      }
      const main = document.querySelector<HTMLElement>('.post-page');
      const success = document.querySelector<HTMLElement>('[data-success-state]');
      const idEl = document.querySelector<HTMLElement>('[data-success-id]');
      if (main) main.setAttribute('hidden', '');
      if (success) success.removeAttribute('hidden');
      if (idEl) idEl.textContent = result.id;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), message);
    } finally {
      setLoading(form, false);
    }
  });
}
