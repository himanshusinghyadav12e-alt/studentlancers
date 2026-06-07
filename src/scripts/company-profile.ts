/**
 * company-profile
 *
 * Client-side wiring for /company/profile:
 *   - Inline + form-level validation
 *   - Live preview that mirrors the form into a "profile" card next
 *     to the editor (logo, website, blurb).
 *   - Character counter on the blurb field
 *   - Submission loading state + saved indicator
 *
 * The page renders a `SubPageShell` fallback when the visitor is not
 * a signed-in company account, so this script is a no-op in that
 * case. The data-attribute mount keeps the import safe from any
 * dashboard page.
 *
 * The form renders the current profile values on the server. The
 * submit handler posts a JSON patch to /api/company-profile, which
 * writes to public.company_profiles. The legacy localStorage path
 * was removed when we wired the editor up to Supabase.
 */

const BLURB_MAX = 600;
const BLURB_MIN = 40;

type FieldName = 'logoUrl' | 'website' | 'blurb';

const VALIDATORS: Record<FieldName, (value: string) => string | null> = {
  logoUrl(value) {
    const v = value.trim();
    if (!v) return null; // logo is optional
    return isHttpUrl(v) ? null : 'Enter a full URL (e.g. https://…).';
  },
  website(value) {
    const v = value.trim();
    if (!v) return null; // website is optional
    return isHttpUrl(v) ? null : 'Enter a full URL (e.g. https://…).';
  },
  blurb(value) {
    const v = value.trim();
    if (v.length < BLURB_MIN) {
      return `Add at least ${BLURB_MIN} characters (currently ${v.length}).`;
    }
    if (v.length > BLURB_MAX) {
      return `Keep the blurb under ${BLURB_MAX} characters.`;
    }
    return null;
  },
};

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function getFieldEl(form: HTMLFormElement, name: FieldName): HTMLElement | null {
  return form.querySelector<HTMLElement>(`[data-field="${name}"]`);
}

function setFieldError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  const fieldEl = field.closest('.ds-field') as HTMLElement | null;
  if (!fieldEl) return;
  fieldEl.querySelectorAll('.ds-field__error[data-profile-error]').forEach((n) => n.remove());
  const input = fieldEl.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ds-input');
  if (input) {
    input.classList.toggle('ds-input--error', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (message) {
    const p = document.createElement('p');
    p.className = 'ds-field__error';
    p.setAttribute('data-profile-error', '');
    p.setAttribute('role', 'alert');
    p.textContent = message;
    fieldEl.appendChild(p);
  }
}

function setFormAlert(
  alertEl: HTMLElement | null,
  message: string | null,
  title = 'Please review the form.',
) {
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
  form.querySelectorAll<HTMLElement>('.ds-field__error[data-profile-error]').forEach((n) => n.remove());
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
    label.textContent = loading ? 'Saving…' : (label.dataset.original ?? 'Save profile');
  }
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button, select, textarea').forEach((el) => {
    el.toggleAttribute('disabled', loading);
  });
}

/* ─── Live preview ──────────────────────────────────────────── */

function hostFromUrl(value: string): string {
  if (!value) return '';
  try {
    return new URL(value).host.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function refreshPreview(form: HTMLFormElement) {
  const logoEl = form.querySelector<HTMLInputElement>('[data-field="logoUrl"]');
  const websiteEl = form.querySelector<HTMLInputElement>('[data-field="website"]');
  const blurbEl = form.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-field="blurb"]');
  if (!logoEl || !websiteEl || !blurbEl) return;

  const logo = logoEl.value.trim();
  const website = websiteEl.value.trim();
  const blurb = blurbEl.value.trim();

  const logoBox = form.querySelector<HTMLElement>('[data-preview-logo]');
  const websiteLink = form.querySelector<HTMLElement>('[data-preview-website]');
  const blurbText = form.querySelector<HTMLElement>('[data-preview-blurb]');

  if (logoBox) {
    // Replace the contents of the logo box with an <img> when we
    // have a URL; otherwise fall back to the initials text.
    if (logo) {
      const img = document.createElement('img');
      img.src = logo;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        // If the image fails to load, fall back to the initials.
        if (logoBox) {
          logoBox.innerHTML = '';
          const span = document.createElement('span');
          span.setAttribute('data-preview-logo-text', '');
          span.textContent =
            form.querySelector<HTMLElement>('[data-preview-logo-text]')?.textContent || '·';
          logoBox.appendChild(span);
        }
      });
      logoBox.innerHTML = '';
      logoBox.appendChild(img);
    } else {
      // Always reset to the initials span if the input is empty.
      const existingImg = logoBox.querySelector('img');
      if (existingImg) {
        const span = document.createElement('span');
        span.setAttribute('data-preview-logo-text', '');
        span.textContent =
          form.querySelector<HTMLElement>('[data-preview-logo-text]')?.textContent || '·';
        logoBox.innerHTML = '';
        logoBox.appendChild(span);
      }
    }
  }

  if (websiteLink) {
    const host = hostFromUrl(website);
    websiteLink.textContent = host || 'example.com';
    if (host) {
      websiteLink.setAttribute('href', website);
      websiteLink.setAttribute('data-empty', 'false');
    } else {
      websiteLink.setAttribute('href', '#');
      websiteLink.setAttribute('data-empty', 'true');
    }
  }

  if (blurbText) {
    blurbText.textContent =
      blurb ||
      'Add a short paragraph so students know what you build and who you hire. This is the first thing they read on your profile.';
    blurbText.setAttribute('data-empty', blurb ? 'false' : 'true');
  }
}

function refreshCount(form: HTMLFormElement) {
  const blurbEl = form.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-field="blurb"]');
  const counter = form.querySelector<HTMLElement>('[data-blurb-count]');
  if (!blurbEl || !counter) return;
  const len = blurbEl.value.trim().length;
  counter.textContent = `${len} / ${BLURB_MAX}`;
  counter.setAttribute('data-over', len > BLURB_MAX ? 'true' : 'false');
}

/* ─── Submit ────────────────────────────────────────────────── */

async function persistProfile(form: HTMLFormElement): Promise<{ ok: true } | { ok: false; message: string }> {
  const data = new FormData(form);
  const patch = {
    logoUrl: String(data.get('logoUrl') || '').trim(),
    website: String(data.get('website') || '').trim(),
    blurb: String(data.get('blurb') || '').trim(),
  };
  let res: Response;
  try {
    res = await fetch('/api/company-profile', {
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
      // ignore
    }
    return { ok: false, message: msg };
  }
  return { ok: true };
}

function showSaved(form: HTMLFormElement) {
  const saved = form.querySelector<HTMLElement>('[data-saved]');
  if (!saved) return;
  saved.removeAttribute('hidden');
  window.setTimeout(() => {
    saved.setAttribute('hidden', '');
  }, 2500);
}

export function mountCompanyProfile() {
  const form = document.querySelector<HTMLFormElement>('[data-company-profile-form]');
  if (!form) return;

  // Track whether the form has unsaved edits — a leave-page prompt
  // only fires when true, and is cleared the moment save succeeds.
  let isDirty = false;
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);

  // Live preview + counter on every input
  form.addEventListener('input', () => {
    isDirty = true;
    refreshPreview(form);
    refreshCount(form);
  });
  // Run once on mount in case the form was re-rendered with values.
  refreshPreview(form);
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
      const result = await persistProfile(form);
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
