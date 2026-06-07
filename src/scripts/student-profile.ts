/**
 * student-profile
 *
 * Client-side wiring for /student/profile. Mirrors the company
 * profile editor:
 *   - Inline + form-level validation
 *   - Character counter on the bio field
 *   - Submission loading state + saved indicator
 *   - beforeunload guard while the form is dirty
 *
 * The form renders the current profile values on the server. The
 * submit handler posts a JSON patch to /api/student-profile, which
 * writes to public.student_profiles (and public.users.name when the
 * caller changes their display name).
 */

const BIO_MAX = 600;
const BIO_MIN = 40;

const VALIDATORS: Record<string, (value: string) => string | null> = {
  name(value) {
    const v = value.trim();
    if (!v) return 'Enter your full name.';
    if (v.length < 2) return 'Name looks too short.';
    return null;
  },
  portfolioUrl(value) {
    const v = value.trim();
    if (!v) return null; // optional
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:'
        ? null
        : 'Enter a full URL (e.g. https://…).';
    } catch {
      return 'Enter a full URL (e.g. https://…).';
    }
  },
  graduationYear(value) {
    const v = value.trim();
    if (!v) return null; // optional
    const n = Number(v);
    if (!Number.isInteger(n) || n < 2024 || n > 2040) {
      return 'Enter a year between 2024 and 2040.';
    }
    return null;
  },
  hourlyRate(value) {
    const v = value.trim();
    if (!v) return null; // optional
    const n = Number(v);
    if (!Number.isFinite(n) || n < 5) return 'Minimum is $5.';
    if (n > 1_000) return 'That rate looks too high — please double-check.';
    return null;
  },
  bio(value) {
    const v = value.trim();
    if (!v) return null; // optional
    if (v.length < BIO_MIN) return `Add at least ${BIO_MIN} characters (currently ${v.length}).`;
    if (v.length > BIO_MAX) return `Keep the bio under ${BIO_MAX} characters.`;
    return null;
  },
};

type FieldName = keyof typeof VALIDATORS;

function getFieldEl(form: HTMLFormElement, name: FieldName): HTMLElement | null {
  return form.querySelector<HTMLElement>(`[data-field="${name}"]`);
}

function setFieldError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  const fieldEl = field.closest('.ds-field') as HTMLElement | null;
  if (!fieldEl) return;
  fieldEl.querySelectorAll('.ds-field__error[data-stu-error]').forEach((n) => n.remove());
  const input = fieldEl.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ds-input');
  if (input) {
    input.classList.toggle('ds-input--error', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (message) {
    const p = document.createElement('p');
    p.className = 'ds-field__error';
    p.setAttribute('data-stu-error', '');
    p.setAttribute('role', 'alert');
    p.textContent = message;
    fieldEl.appendChild(p);
  }
}

function setFormAlert(alertEl: HTMLElement | null, message: string | null) {
  if (!alertEl) return;
  if (!message) {
    alertEl.setAttribute('hidden', '');
    return;
  }
  alertEl.removeAttribute('hidden');
  const titleEl = alertEl.querySelector<HTMLElement>('[data-form-alert-title]');
  const msgEl = alertEl.querySelector<HTMLElement>('[data-form-alert-msg]');
  if (titleEl) titleEl.textContent = 'Please review the form.';
  if (msgEl) msgEl.textContent = message;
}

function clearAllErrors(form: HTMLFormElement) {
  form.querySelectorAll<HTMLElement>('.ds-field__error[data-stu-error]').forEach((n) => n.remove());
  form.querySelectorAll<HTMLElement>('.ds-input').forEach((input) => {
    input.classList.remove('ds-input--error');
    input.removeAttribute('aria-invalid');
  });
  setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), null);
}

function validateForm(form: HTMLFormElement): string | null {
  let firstInvalid: HTMLElement | null = null;
  let firstMessage = '';

  (Object.keys(VALIDATORS) as FieldName[]).forEach((name) => {
    const fieldEl = getFieldEl(form, name);
    if (!fieldEl) return;
    const value =
      fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLTextAreaElement
        ? fieldEl.value
        : '';
    const error = VALIDATORS[name](value);
    setFieldError(fieldEl, error);
    if (error && !firstInvalid) {
      firstInvalid = fieldEl;
      firstMessage = error;
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
    label.textContent = loading ? 'Saving…' : (label.dataset.original ?? 'Save profile');
  }
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button, select, textarea').forEach((el) => {
    el.toggleAttribute('disabled', loading);
  });
}

function refreshCount(form: HTMLFormElement) {
  const bioEl = form.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-field="bio"]');
  const counter = form.querySelector<HTMLElement>('[data-bio-count]');
  if (!bioEl || !counter) return;
  const len = bioEl.value.trim().length;
  counter.textContent = `${len} / ${BIO_MAX}`;
  counter.setAttribute('data-over', len > BIO_MAX ? 'true' : 'false');
}

interface ProfilePatch {
  name: string;
  bio: string | null;
  university: string | null;
  major: string | null;
  graduationYear: number | null;
  hourlyRateCents: number | null;
  skills: string[];
  portfolioUrl: string | null;
}

function readPatch(form: HTMLFormElement): ProfilePatch {
  const data = new FormData(form);
  const skills = String(data.get('skills') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const rate = String(data.get('hourlyRate') || '').trim();
  const grad = String(data.get('graduationYear') || '').trim();
  return {
    name: String(data.get('name') || '').trim(),
    bio: String(data.get('bio') || '').trim() || null,
    university: String(data.get('university') || '').trim() || null,
    major: String(data.get('major') || '').trim() || null,
    graduationYear: grad ? Number(grad) : null,
    hourlyRateCents: rate ? Math.round(Number(rate) * 100) : null,
    skills,
    portfolioUrl: String(data.get('portfolioUrl') || '').trim() || null,
  };
}

async function persist(form: HTMLFormElement): Promise<{ ok: true } | { ok: false; message: string }> {
  const patch = readPatch(form);
  let res: Response;
  try {
    res = await fetch('/api/student-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
  if (!res.ok) {
    let msg = `Save failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore parse error
    }
    return { ok: false, message: msg };
  }
  return { ok: true };
}

function showSaved(form: HTMLFormElement) {
  const saved = form.querySelector<HTMLElement>('[data-saved]');
  if (!saved) return;
  saved.removeAttribute('hidden');
  window.setTimeout(() => saved.setAttribute('hidden', ''), 2500);
}

export function mountStudentProfile() {
  const form = document.querySelector<HTMLFormElement>('[data-student-profile-form]');
  if (!form) return;

  let isDirty = false;
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);

  form.addEventListener('input', () => {
    isDirty = true;
    refreshCount(form);
  });
  refreshCount(form);

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
      const result = await persist(form);
      if (!result.ok) {
        setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), result.message);
        return;
      }
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), null);
      isDirty = false;
      window.removeEventListener('beforeunload', beforeUnload);
      showSaved(form);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), message);
    } finally {
      setLoading(form, false);
    }
  });
}
