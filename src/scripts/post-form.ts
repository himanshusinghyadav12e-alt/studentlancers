/**
 * post-form
 *
 * Client-side wiring for /jobs/post:
 *   - Inline + form-level validation
 *   - Tag input (add on Enter, remove on click)
 *   - LocalStorage draft autosave (debounced 300ms)
 *   - Live preview that mirrors the form into a "summary" card
 *   - Submission loading state + success card with a generated id
 */

interface FormCtx {
  form: HTMLFormElement;
}

const STORAGE_KEY = 'sl-post-draft-v1';
const MAX_SKILLS = 8;

const VALIDATORS: Record<string, (value: string) => string | null> = {
  title(value) {
    const v = value.trim();
    if (!v) return 'Give your brief a title.';
    if (v.length < 4) return 'A title needs at least 4 characters.';
    if (v.length > 80) return 'Keep the title under 80 characters.';
    return null;
  },
  category(value) {
    if (!value) return 'Pick a category.';
    return null;
  },
  summary(value) {
    const v = value.trim();
    if (!v) return 'Add a one-sentence summary.';
    if (v.length < 20) return 'A summary of at least 20 characters helps.';
    if (v.length > 280) return 'Keep the summary under 280 characters.';
    return null;
  },
  budget(value) {
    const n = Number(value);
    if (!value) return 'Set a budget amount.';
    if (!Number.isFinite(n) || n < 20) return 'Minimum budget is $20.';
    if (n > 1_000_000) return 'That budget looks too high — please double-check.';
    return null;
  },
  duration(value) {
    if (!value) return 'Pick a duration.';
    return null;
  },
  hours(value) {
    if (!value) return 'Pick a weekly load.';
    return null;
  },
  description(value) {
    const v = value.trim();
    if (!v) return 'Write the full brief.';
    if (v.length < 200) return `Add at least 200 characters (currently ${v.length}).`;
    return null;
  },
};

function setFieldError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  // Most fields live inside a .ds-field wrapper (Field component).
  // The tag input does not — fall back to the field itself so we
  // can still surface the error inline below it.
  const fieldEl = (field.closest('.ds-field') as HTMLElement | null) ?? field;
  fieldEl.querySelectorAll('.ds-field__error[data-post-error]').forEach((n) => n.remove());
  const input = fieldEl.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.ds-input, .post-tags');
  if (input && 'classList' in input) {
    input.classList.toggle('ds-input--error', Boolean(message));
    if ('setAttribute' in input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }
  if (message) {
    const p = document.createElement('p');
    p.className = 'ds-field__error';
    p.setAttribute('data-post-error', '');
    p.setAttribute('role', 'alert');
    p.textContent = message;
    fieldEl.appendChild(p);
  }
}

function setFormAlert(alertEl: HTMLElement | null, message: string | null, title = 'A few fields need attention.') {
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
  form.querySelectorAll<HTMLElement>('.ds-field__error[data-post-error]').forEach((n) => n.remove());
  form.querySelectorAll<HTMLElement>('.ds-input').forEach((input) => {
    input.classList.remove('ds-input--error');
    input.removeAttribute('aria-invalid');
  });
  setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), null);
}

function validateForm(form: HTMLFormElement, skills: string[]): string | null {
  let firstInvalid: HTMLElement | null = null;
  let firstMessage = '';

  const fields = form.querySelectorAll<HTMLElement>('[data-field]');
  fields.forEach((fieldEl) => {
    const name = fieldEl.getAttribute('data-field') || '';
    let value = '';
    let error: string | null = null;

    if (fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLTextAreaElement || fieldEl instanceof HTMLSelectElement) {
      value = fieldEl.value;
    }
    if (name === 'budget_type') {
      // already covered by `category`-style radios; skip per-input check
      return;
    }
    if (name && VALIDATORS[name]) {
      error = VALIDATORS[name]!(value);
    }
    setFieldError(fieldEl, error);
    if (error) {
      if (!firstInvalid) {
        firstInvalid = fieldEl;
        firstMessage = error;
      }
    }
  });

  if (skills.length < 3) {
    const tags = form.querySelector<HTMLElement>('[data-tags]');
    if (tags) {
      setFieldError(tags, 'Add at least 3 skills so students can find this brief.');
      if (!firstInvalid) {
        firstInvalid = tags;
        firstMessage = 'Add at least 3 skills so students can find this brief.';
      }
    }
  } else {
    setFieldError(form.querySelector<HTMLElement>('[data-tags]'), null);
  }

  if (firstInvalid instanceof HTMLElement) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Prefer focusing a real focusable target inside the invalid
    // region — the tag input is a div wrapper around an <input>,
    // so focusing the wrapper would do nothing. For Field-wrapped
    // controls the first form control is the right focus target.
    const focusTarget =
      (firstInvalid.matches('input, textarea, select')
        ? firstInvalid
        : firstInvalid.querySelector<HTMLElement>('input, textarea, select')) || firstInvalid;
    if (typeof focusTarget.focus === 'function') {
      // Use preventScroll: the smooth scrollIntoView above already
      // brought the field into view; calling focus() with default
      // behavior would jump-scroll again.
      try {
        focusTarget.focus({ preventScroll: true });
      } catch {
        focusTarget.focus();
      }
    }
    return firstMessage;
  }
  return null;
}

/* ─── Tag input ─────────────────────────────────────────────── */

function makeTag(label: string) {
  const li = document.createElement('li');
  li.className = 'post-tags__item';
  li.setAttribute('role', 'listitem');
  li.innerHTML = `
    <span class="post-tags__label"></span>
    <button type="button" aria-label="Remove skill">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  `;
  li.querySelector('.post-tags__label')!.textContent = label;
  li.querySelector('button')!.addEventListener('click', () => {
    li.remove();
    formChanged();
  });
  return li;
}

function attachTags(form: HTMLFormElement, initial: string[], onChange: () => void) {
  const wrap = form.querySelector<HTMLElement>('[data-tags]');
  if (!wrap) return { getSkills: () => [] as string[] };
  const list = wrap.querySelector<HTMLElement>('[data-tags-list]')!;
  const input = wrap.querySelector<HTMLInputElement>('[data-tags-input]')!;

  initial.forEach((skill) => list.appendChild(makeTag(skill)));

  const getSkills = () =>
    Array.from(list.querySelectorAll<HTMLElement>('.post-tags__item .post-tags__label')).map((el) =>
      el.textContent || '',
    );

  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    if (getSkills().length >= MAX_SKILLS) {
      input.value = '';
      return;
    }
    // Dedupe case-insensitively
    if (getSkills().some((s) => s.toLowerCase() === value.toLowerCase())) {
      input.value = '';
      return;
    }
    list.appendChild(makeTag(value));
    input.value = '';
    onChange();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !input.value && getSkills().length) {
      // Convenience: backspace on empty input removes the last tag
      const last = list.querySelector<HTMLElement>('.post-tags__item:last-child');
      last?.remove();
      onChange();
    }
  });
  input.addEventListener('blur', commit);

  return { getSkills };
}

/* ─── Live preview summary ──────────────────────────────────── */

function formatDuration(d: string) {
  switch (d) {
    case '1week': return 'Less than 1 week';
    case '2weeks': return '1–2 weeks';
    case '1month': return '2–4 weeks';
    case '3months': return '1–3 months';
    case 'ongoing': return 'Ongoing';
    default: return '';
  }
}

function formatHours(h: string) {
  switch (h) {
    case '1-5': return '1–5 hrs / week';
    case '5-10': return '5–10 hrs / week';
    case '10-20': return '10–20 hrs / week';
    case '20+': return '20+ hrs / week';
    default: return '';
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSummary(form: HTMLFormElement, skills: string[]) {
  // The summary card lives in the .post-summary aside, outside the
  // form. Look it up on the document instead of scoping to the form.
  const summaryBody = document.querySelector<HTMLElement>('[data-summary-body]');
  const summaryStatus = document.querySelector<HTMLElement>('[data-summary-status]');
  if (!summaryBody || !summaryStatus) return;

  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  const category = String(data.get('category') || '').trim();
  const summary = String(data.get('summary') || '').trim();
  const budgetType = String(data.get('budget_type') || '').trim();
  const budget = String(data.get('budget') || '').trim();
  const duration = String(data.get('duration') || '').trim();
  const hours = String(data.get('hours') || '').trim();

  if (!title && !summary && !skills.length) {
    summaryBody.innerHTML = `
      <p style="margin: 0; color: var(--color-body); font-size: var(--text-body-sm);">
        As you fill out the form, your brief will appear here so you can see
        exactly what students will see.
      </p>`;
    summaryStatus.textContent = 'Empty';
    summaryStatus.className = 'dash-pill';
    return;
  }

  const budgetText = budget ? `$${Number(budget).toLocaleString()}` : '';
  const meta: string[] = [];
  if (category) meta.push(category.charAt(0).toUpperCase() + category.slice(1));
  if (budgetType === 'fixed' && budgetText) meta.push(`${budgetText} fixed`);
  else if (budgetType === 'hourly' && budgetText) meta.push(`${budgetText} / hr`);
  if (duration) meta.push(formatDuration(duration));
  if (hours) meta.push(formatHours(hours));

  summaryBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
      <strong style="font-size: var(--text-body-md); color: var(--color-ink); line-height: 1.3;">
        ${title ? escapeHtml(title) : 'Untitled brief'}
      </strong>
      ${summary ? `<p style="margin: 0; color: var(--color-body); font-size: var(--text-body-sm);">${escapeHtml(summary)}</p>` : ''}
      ${meta.length ? `<div style="display: flex; flex-wrap: wrap; gap: 6px;">${meta
        .map((m) => `<span class="dash-pill">${escapeHtml(m)}</span>`)
        .join('')}</div>` : ''}
      ${
        skills.length
          ? `<div style="display: flex; flex-wrap: wrap; gap: 6px;">${skills
              .map(
                (s) =>
                  `<span class="dash-pill dash-pill--cyan" style="text-transform: none; letter-spacing: 0;">${escapeHtml(s)}</span>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>
  `;
  summaryStatus.textContent = title ? 'Live' : 'In progress';
  summaryStatus.className = `dash-pill ${title ? 'dash-pill--success' : 'dash-pill--warning'}`;
}

/* ─── Draft autosave ────────────────────────────────────────── */

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

function collectDraft(form: HTMLFormElement, skills: string[]) {
  const data = new FormData(form);
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) obj[k] = String(v);
  return { ...obj, skills };
}

function applyDraft(form: HTMLFormElement, draft: ReturnType<typeof collectDraft>) {
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'skills') continue;
    const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${key}"]`);
    if (el && value !== undefined && value !== null) {
      // Radio group requires special handling
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        if (el.value === value) el.checked = true;
      } else {
        el.value = String(value);
      }
    }
  }
  // Re-sync the radio visual state
  form.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) => {
    const wrap = r.closest('[data-choice]');
    if (wrap) wrap.classList.toggle('is-selected', r.checked);
  });
}

function setLoading(form: HTMLFormElement, loading: boolean) {
  const submit = form.querySelector<HTMLElement>('[data-submit]');
  const label = form.querySelector<HTMLElement>('[data-submit-label]');
  if (submit) submit.setAttribute('data-loading', loading ? 'true' : 'false');
  if (label) {
    if (!label.dataset.original) label.dataset.original = label.textContent ?? '';
    label.textContent = loading ? 'Publishing…' : (label.dataset.original ?? 'Publish brief');
  }
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button, select, textarea').forEach((el) => {
    el.toggleAttribute('disabled', loading);
  });
}

async function fakeSubmit(_data: FormData): Promise<{ ok: true; id: string }> {
  await new Promise((r) => setTimeout(r, 700));
  const id = 'BR-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  return { ok: true, id };
}

/**
 * Real submit path: persists the brief to the local store. Returns
 * the generated brief id and brief record.
 *
 * Reads from a FormData snapshot taken before the form was disabled
 * (disabled fields are excluded from FormData, so calling new
 * FormData(form) after setLoading(true) returns empty).
 */
import { store } from './store';
async function persistBrief(
  data: FormData,
  skills: string[],
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const session = store.auth.current();
  if (!session || session.role !== 'company') {
    return { ok: false, message: 'You need to be signed in as a company to post a brief.' };
  }
  const title = String(data.get('title') || '').trim();
  const category = String(data.get('category') || '').trim();
  const summary = String(data.get('summary') || '').trim();
  const description = String(data.get('description') || '').trim();
  const budgetType = String(data.get('budget_type') || 'fixed') as 'fixed' | 'hourly';
  const budget = Number(data.get('budget') || 0);
  const duration = String(data.get('duration') || '').trim();
  const hours = String(data.get('hours') || '').trim();
  const links = String(data.get('links') || '').trim();

  if (!title || !category || !summary || !description || !duration || !hours) {
    return { ok: false, message: 'Please fill in every required field.' };
  }
  if (skills.length < 3) {
    return { ok: false, message: 'Add at least 3 skills.' };
  }

  const brief = store.briefs.create({
    title,
    category,
    summary,
    description,
    budgetType,
    budget,
    duration,
    hours,
    skills,
    links,
    ownerId: session.userId,
    ownerName: session.name,
  });
  return { ok: true, id: brief.id };
}

function setDraftStatus(form: HTMLFormElement, text: string) {
  const el = form.querySelector<HTMLElement>('[data-draft-status]');
  if (el) el.textContent = text;
}

export function mountPostForm() {
  const form = document.querySelector<HTMLFormElement>('[data-post-form]');
  if (!form) return;

  // Restore draft
  let draftSkills: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const draft = JSON.parse(raw) as ReturnType<typeof collectDraft>;
      if (draft && typeof draft === 'object') {
        applyDraft(form, draft);
        draftSkills = Array.isArray(draft.skills) ? draft.skills.slice(0, MAX_SKILLS) : [];
        setDraftStatus(form, 'Draft restored from this device.');
      }
    }
  } catch {
    // ignore
  }

  // Tags
  const { getSkills } = attachTags(form, draftSkills, () => {
    saveDraft();
    renderSummary(form, getSkills());
  });

  // Render initial summary
  renderSummary(form, getSkills());

  // Draft autosave (debounced)
  const saveDraft = debounce(() => {
    try {
      const draft = collectDraft(form, getSkills());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setDraftStatus(form, `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch {
      // ignore
    }
  }, 300);

  form.addEventListener('input', () => {
    saveDraft();
    renderSummary(form, getSkills());
    // Hide the top-level alert as soon as the user starts fixing
    // things — the per-field errors will still drive the rest of
    // the experience, and a stale "X needs attention" banner that
    // sits at the top of the form feels punitive.
    const alertEl = form.querySelector<HTMLElement>('[data-form-alert]');
    if (alertEl && !alertEl.hidden) setFormAlert(alertEl, null);
  });
  form.addEventListener('change', () => {
    saveDraft();
    renderSummary(form, getSkills());
  });

  // Wire the alert's dismiss button (rendered next to the message).
  form.querySelector<HTMLButtonElement>('[data-form-alert-close]')?.addEventListener('click', () => {
    setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), null);
  });

  // Clear draft
  const clearBtn = form.querySelector<HTMLButtonElement>('[data-clear-draft]');
  clearBtn?.addEventListener('click', () => {
    if (!confirm('Clear the draft? This cannot be undone.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    form.reset();
    form.querySelectorAll<HTMLElement>('.post-tags__item').forEach((n) => n.remove());
    form.querySelectorAll<HTMLElement>('[data-choice]').forEach((c) => c.classList.toggle('is-selected', false));
    const checked = form.querySelector<HTMLInputElement>('input[name="budget_type"][value="fixed"]');
    if (checked) {
      checked.checked = true;
      const wrap = checked.closest('[data-choice]');
      if (wrap) wrap.classList.add('is-selected');
    }
    renderSummary(form, []);
    setDraftStatus(form, 'Draft cleared.');
  });

  // Submit
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAllErrors(form);
    const error = validateForm(form, getSkills());
    if (error) {
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), error);
      return;
    }
    // Capture data before disabling the form
    const data = new FormData(form);
    const skillsSnapshot = getSkills();
    setLoading(form, true);
    try {
      const result = await persistBrief(data, skillsSnapshot);
      if (!result.ok) {
        setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), result.message);
        setLoading(form, false);
        return;
      }
      // Success: hide the form, show the success card
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      const main = document.querySelector<HTMLElement>('.post-page');
      const success = document.querySelector<HTMLElement>('[data-success-state]');
      const idEl = document.querySelector<HTMLElement>('[data-success-id]');
      if (main) main.setAttribute('hidden', '');
      if (success) success.removeAttribute('hidden');
      if (idEl) idEl.textContent = result.id;
      // Mention the skill count in the success message (real, verified data).
      // Keep the [data-success-id] hook on the code element so tests and
      // any future "copy id" affordance can still find it after the
      // innerHTML replacement.
      const successBody = success?.querySelector<HTMLElement>('.auth-success__body');
      if (successBody) {
        const skillsCount = skillsSnapshot.length;
        const totalLength = String(data.get('description') || '').trim().length;
        successBody.innerHTML = `
          Brief <code class="post-success__id" data-success-id>${result.id}</code> has been published
          with <strong>${skillsCount}</strong> skill${skillsCount === 1 ? '' : 's'} and a
          <strong>${totalLength.toLocaleString()}-character</strong> description.
          Students can apply right away.
        `;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), message);
    } finally {
      setLoading(form, false);
    }
  });
}
