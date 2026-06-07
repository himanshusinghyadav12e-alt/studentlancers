/**
 * auth-form
 *
 * Client-side wiring for the auth pages. Wires:
 *   - Password show/hide toggle (multiple per page)
 *   - Account type radio visual sync
 *   - Inline validation + form-level alerts
 *   - Password strength meter
 *   - Submission loading state (delegates to the local store)
 *   - Forgot-password success state + resend
 *
 * Submissions go through `store.auth`, which is a localStorage-backed
 * mock. Replace the body of `submitForm` with a real fetch() call
 * when the API ships — the rest of the UI is wired against the same
 * `Session` shape.
 */

import { getBrowserSupabase } from '../lib/supabase-browser';
import { SESSION_STORAGE_KEY, type AppSession, type Role } from '../lib/types';

interface FormContext {
  form: HTMLFormElement;
  kind: 'login' | 'signup' | 'forgot';
}

function mapAuthError(err: { message: string } | null): string {
  if (!err) return 'Something went wrong. Please try again.';
  const msg = err.message.toLowerCase();
  // Friendly copy for the most common failure modes.
  if (msg.includes('invalid login credentials')) return 'That email and password do not match.';
  if (msg.includes('email not confirmed')) {
    return 'Check your inbox to confirm your email, then sign in.';
  }
  if (msg.includes('user already registered')) {
    return 'An account with that email already exists. Try logging in.';
  }
  if (msg.includes('password should be')) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('rate limit')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return err.message;
}

function storeSession(session: AppSession) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable; the middleware-mirrored cookie still
    // drives the pre-paint redirect.
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALIDATORS: Record<string, (value: string, form: HTMLFormElement) => string | null> = {
  email(value) {
    if (!value.trim()) return 'Enter your email address.';
    if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
    return null;
  },
  password(value) {
    if (!value) return 'Enter your password.';
    if (value.length < 8) return 'Password must be at least 8 characters.';
    return null;
  },
  name(value) {
    if (!value.trim()) return 'Enter your full name.';
    if (value.trim().length < 2) return 'Name looks too short.';
    return null;
  },
  confirm(value, form) {
    if (!value) return 'Confirm your password.';
    const pw = (form.querySelector<HTMLInputElement>('[data-field="password"]')?.value) ?? '';
    if (value !== pw) return 'Passwords do not match.';
    return null;
  },
};

function strengthScore(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) score += 1;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['Too short', 'Weak', 'Okay', 'Strong', 'Excellent'];

function setFieldError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  const fieldEl =
    (field.closest('.ds-field') as HTMLElement | null) ??
    (field.closest('[data-terms]') as HTMLElement | null) ??
    (field.closest('label') as HTMLElement | null);
  if (!fieldEl) return;

  fieldEl.querySelectorAll('.ds-field__error[data-auth-error]').forEach((n) => n.remove());

  const input = fieldEl.querySelector<HTMLInputElement>('.ds-input');
  if (input) {
    input.classList.toggle('ds-input--error', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    field.classList.toggle('auth-check__input--error', Boolean(message));
  }

  if (message) {
    const p = document.createElement('p');
    p.className = 'ds-field__error';
    p.setAttribute('data-auth-error', '');
    p.setAttribute('role', 'alert');
    p.textContent = message;
    fieldEl.appendChild(p);
  }
}

function setFormAlert(alertEl: HTMLElement | null, message: string | null, title = 'Something went wrong.', variant?: 'success' | 'error') {
  if (!alertEl) return;
  if (!message) {
    alertEl.setAttribute('hidden', '');
    alertEl.classList.remove('auth-alert--success');
    return;
  }
  alertEl.removeAttribute('hidden');
  alertEl.classList.toggle('auth-alert--success', variant === 'success');
  const titleEl = alertEl.querySelector<HTMLElement>('[data-form-alert-title]');
  const msgEl = alertEl.querySelector<HTMLElement>('[data-form-alert-msg]');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
}

function clearAllErrors(form: HTMLFormElement) {
  form.querySelectorAll<HTMLElement>('.ds-field__error[data-auth-error]').forEach((n) => n.remove());
  form.querySelectorAll<HTMLInputElement>('.ds-input').forEach((input) => {
    input.classList.remove('ds-input--error');
    input.removeAttribute('aria-invalid');
  });
  const alertEl = form.querySelector<HTMLElement>('[data-form-alert]');
  setFormAlert(alertEl, null);
}

function validateForm(form: HTMLFormElement, kind: FormContext['kind']): string | null {
  let firstInvalid: HTMLElement | null = null;
  let firstMessage = '';

  const fields = form.querySelectorAll<HTMLElement>('[data-field]');
  fields.forEach((fieldEl) => {
    const name = fieldEl.getAttribute('data-field') || '';
    let value = '';
    let error: string | null = null;

    if (fieldEl instanceof HTMLInputElement && fieldEl.type === 'checkbox') {
      if (fieldEl.required && !fieldEl.checked) {
        error = 'You must accept the terms to continue.';
      }
    } else if (fieldEl instanceof HTMLInputElement) {
      value = fieldEl.value;
    } else if (fieldEl instanceof HTMLTextAreaElement) {
      value = fieldEl.value;
    }

    if (name && VALIDATORS[name] && (fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLTextAreaElement)) {
      error = VALIDATORS[name](value, form);
    }

    setFieldError(fieldEl, error);
    if (error) {
      if (!firstInvalid) {
        firstInvalid = fieldEl;
        firstMessage = error;
      }
    }
  });

  if (firstInvalid instanceof HTMLElement) {
    firstInvalid.focus();
    return firstMessage;
  }
  return null;
}

function attachPasswordToggles(form: HTMLFormElement) {
  form.querySelectorAll<HTMLButtonElement>('[data-password-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const input = form.querySelector<HTMLInputElement>(`#${targetId}`);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      const show = btn.querySelector<HTMLElement>('.auth-input-toggle__show');
      const hide = btn.querySelector<HTMLElement>('.auth-input-toggle__hide');
      if (show) show.hidden = isHidden;
      if (hide) hide.hidden = !isHidden;
    });
  });
}

function attachAccountType(form: HTMLFormElement) {
  const choices = form.querySelectorAll<HTMLElement>('[data-choice]');
  if (!choices.length) return;

  const sync = () => {
    choices.forEach((choice) => {
      const input = choice.querySelector<HTMLInputElement>('.auth-choice__input');
      if (!input) return;
      choice.classList.toggle('is-selected', input.checked);
    });
  };

  choices.forEach((choice) => {
    const input = choice.querySelector<HTMLInputElement>('.auth-choice__input');
    if (!input) return;
    input.addEventListener('change', sync);
    input.addEventListener('focus', () => choice.classList.add('is-focused'));
    input.addEventListener('blur', () => choice.classList.remove('is-focused'));
  });
  sync();
}

function attachStrengthMeter(form: HTMLFormElement) {
  const meter = form.querySelector<HTMLElement>('[data-strength-meter]');
  const input = form.querySelector<HTMLInputElement>('[data-password-meter]');
  const label = form.querySelector<HTMLElement>('[data-strength-label]');
  if (!meter || !input) return;

  const update = () => {
    const score = strengthScore(input.value);
    if (!input.value) {
      meter.setAttribute('hidden', '');
      meter.removeAttribute('data-strength');
      return;
    }
    meter.removeAttribute('hidden');
    meter.setAttribute('data-strength', String(score));
    if (label) label.textContent = `Strength · ${STRENGTH_LABELS[score]}`;
  };

  input.addEventListener('input', update);
  update();
}

/** Wait helper to simulate network latency in the mock. */
function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function setLoading(form: HTMLFormElement, loading: boolean) {
  const submit = form.querySelector<HTMLElement>('[data-submit]');
  const label = form.querySelector<HTMLElement>('[data-submit-label]');
  if (submit) submit.setAttribute('data-loading', loading ? 'true' : 'false');
  if (label && submit instanceof HTMLButtonElement) {
    if (!label.dataset.original) label.dataset.original = label.textContent ?? '';
    label.textContent = loading ? 'Working…' : (label.dataset.original ?? label.textContent ?? '');
  }
  form.querySelectorAll<HTMLInputElement>('input, button, select, textarea').forEach((el) => {
    if (el instanceof HTMLButtonElement && el.hasAttribute('data-password-toggle')) return;
    el.toggleAttribute('disabled', loading);
  });
}

function attachForgotFlow(form: HTMLFormElement) {
  const requestState = form.querySelector<HTMLElement>('[data-request-state]');
  const successState = form.querySelector<HTMLElement>('[data-success-state]');
  const successEmail = form.querySelector<HTMLElement>('[data-success-email]');
  const resendBtn = form.querySelector<HTMLButtonElement>('[data-resend]');
  if (!requestState || !successState) return;

  form.addEventListener('auth:success', (event) => {
    const detail = (event as CustomEvent<{ email?: string }>).detail;
    if (successEmail && detail?.email) successEmail.textContent = detail.email;
    requestState.setAttribute('hidden', '');
    successState.removeAttribute('hidden');
    const heading = successState.querySelector<HTMLElement>('.auth-success__title');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  });

  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      const email = (form.querySelector<HTMLInputElement>('[data-field="email"]')?.value) ?? '';
      setLoading(form, true);
      // Re-issue the password-reset email. The Supabase rate limiter
      // (default 1 req / 60s) is the only thing that can fail this
      // call; we deliberately swallow that case so the UI still
      // shows a friendly "Resent" state and the user can wait.
      try {
        await getBrowserSupabase().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/student/settings`,
        });
      } catch {
        // ignore — handled by the optimistic UI below.
      }
      setLoading(form, false);
      resendBtn.textContent = 'Resent ✓';
      window.setTimeout(() => {
        resendBtn.textContent = 'Didn’t get it? Resend';
      }, 2400);
    });
  }
}

function redirectAfterAuth(role: 'student' | 'company'): void {
  // Honor a same-origin `?next=` deep-link so a user who was bounced
  // from a protected page lands back where they started. Default to
  // the role's home if no next is set.
  const params = new URLSearchParams(window.location.search);
  const rawNext = params.get('next');
  // Same-origin absolute path only — drop protocol-relative and
  // external URLs to prevent open-redirects.
  const isSafe =
    !!rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//');
  // Do not bounce back to another auth page — that would just
  // re-trigger the guest-only guard and loop the user back here.
  const isAuthPage =
    isSafe &&
    (rawNext === '/login' ||
      rawNext === '/signup' ||
      rawNext === '/forgot-password' ||
      rawNext.startsWith('/login?') ||
      rawNext.startsWith('/signup?') ||
      rawNext.startsWith('/forgot-password?'));
  const next =
    isSafe && !isAuthPage
      ? rawNext
      : role === 'company'
        ? '/company/dashboard'
        : '/student/dashboard';
  // Slight delay so the success state is briefly visible before navigation.
  window.setTimeout(() => {
    window.location.href = next;
  }, 400);
}

function attachSubmit(form: HTMLFormElement, kind: FormContext['kind']) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAllErrors(form);
    const errorMessage = validateForm(form, kind);
    if (errorMessage) {
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), errorMessage);
      return;
    }

    const data = new FormData(form);
    setLoading(form, true);
    const supabase = getBrowserSupabase();
    try {
      if (kind === 'login') {
        const email = String(data.get('email') ?? '').trim();
        const password = String(data.get('password') ?? '');
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !signInData.user) {
          setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), mapAuthError(error));
          setLoading(form, false);
          return;
        }
        // Pull our public.users row so we know the role and display name.
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', signInData.user.id)
          .maybeSingle();
        const session: AppSession = {
          userId: signInData.user.id,
          email: signInData.user.email ?? email,
          name: (profile as { name?: string } | null)?.name ?? email.split('@')[0],
          role: ((profile as { role?: Role } | null)?.role ?? 'student') as Role,
          signedInAt: new Date().toISOString(),
        };
        storeSession(session);
        setFormAlert(
          form.querySelector<HTMLElement>('[data-form-alert]'),
          `Welcome back, ${session.name.split(' ')[0]}. Redirecting…`,
          'Signed in',
          'success',
        );
        redirectAfterAuth(session.role);
        return;
      }

      if (kind === 'signup') {
        const accountType = String(data.get('account_type') ?? 'student');
        const role: Role = accountType === 'company' ? 'company' : 'student';
        const email = String(data.get('email') ?? '').trim();
        const password = String(data.get('password') ?? '');
        const name = String(data.get('name') ?? '').trim();
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role, name },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error || !signUpData.user) {
          setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), mapAuthError(error));
          setLoading(form, false);
          return;
        }
        // If email confirmation is required, `session` is null and the
        // user has to click the link in their inbox. The trigger we
        // installed in 0001_initial_schema.sql still creates their
        // public.users / profile row on insert into auth.users.
        if (!signUpData.session) {
          setFormAlert(
            form.querySelector<HTMLElement>('[data-form-alert]'),
            'Check your inbox to confirm your email, then sign in.',
            'Confirm your email',
            'success',
          );
          setLoading(form, false);
          return;
        }
        const session: AppSession = {
          userId: signUpData.user.id,
          email: signUpData.user.email ?? email,
          name,
          role,
          signedInAt: new Date().toISOString(),
        };
        storeSession(session);
        setFormAlert(
          form.querySelector<HTMLElement>('[data-form-alert]'),
          `Account ready. Taking you to the ${role === 'company' ? 'company' : 'student'} dashboard…`,
          `Welcome, ${name.split(' ')[0]}`,
          'success',
        );
        redirectAfterAuth(role);
        return;
      }

      if (kind === 'forgot') {
        const email = String(data.get('email') ?? '').trim();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/student/settings`,
        });
        setLoading(form, false);
        if (error) {
          setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), mapAuthError(error));
          return;
        }
        form.dispatchEvent(new CustomEvent('auth:success', { detail: { email } }));
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), message);
    } finally {
      // For login/signup the page is navigating away, so leaving the
      // loading state engaged is fine. Forgot-password handles its own
      // loading toggle above.
    }
  });
}

function attachLiveValidation(form: HTMLFormElement) {
  form.querySelectorAll<HTMLInputElement>('[data-field]').forEach((fieldEl) => {
    if (!(fieldEl instanceof HTMLInputElement)) return;
    const name = fieldEl.getAttribute('data-field') || '';
    if (!name) return;
    const handler = () => {
      const fieldWrap = fieldEl.closest('.ds-field');
      if (!fieldWrap) return;
      const hasError = fieldWrap.querySelector('[data-auth-error]');
      if (!hasError) return;
      if (fieldEl.type === 'checkbox') {
        setFieldError(fieldEl, fieldEl.required && !fieldEl.checked ? 'You must accept the terms to continue.' : null);
        return;
      }
      const validator = VALIDATORS[name];
      if (validator) setFieldError(fieldEl, validator(fieldEl.value, form));
    };
    fieldEl.addEventListener('input', handler);
    fieldEl.addEventListener('change', handler);
    fieldEl.addEventListener('blur', handler);
  });
}

function attachGoogleStub(form: HTMLFormElement) {
  const btn = form.querySelector<HTMLButtonElement>('[data-google-signin]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.setAttribute('aria-busy', 'true');
    btn.style.opacity = '0.7';
    window.setTimeout(() => {
      btn.removeAttribute('aria-busy');
      btn.style.opacity = '';
      setFormAlert(
        form.querySelector<HTMLElement>('[data-form-alert]'),
        'Google sign-in is not yet wired up. Use your email to continue.',
      );
    }, 400);
  });
}

/**
 * When a guest is bounced from a protected page, the URL has a safe
 * `?next=/some/path`. Surface that as an inline "Please sign in to
 * continue" notice so the redirect is not silent. Skipped on the
 * forgot-password page (no auth required) and on /login if there is
 * no `?next=`.
 */
function attachNextNotice(form: HTMLFormElement, kind: FormContext['kind']) {
  if (kind === 'forgot') return;
  const params = new URLSearchParams(window.location.search);
  const rawNext = params.get('next');
  if (!rawNext) return;
  if (!rawNext.startsWith('/') || rawNext.startsWith('//')) return;

  // Human-friendly destination label for the banner. Falls back to
  // the raw path if we do not know the route.
  const dest = describeNextPath(rawNext);

  const note = document.createElement('div');
  note.className = 'auth-alert auth-alert--info';
  note.setAttribute('data-next-notice', '');
  note.setAttribute('role', 'status');
  note.innerHTML = `
    <span class="auth-alert__icon" aria-hidden="true">
      <svg viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.4" />
        <path d="M9 5.5v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        <circle cx="9" cy="12.4" r="0.9" fill="currentColor" />
      </svg>
    </span>
    <div class="auth-alert__body">
      <p class="auth-alert__title">Sign in to continue</p>
      <p class="auth-alert__msg"></p>
    </div>
  `;
  // Build the message with textContent so the destination label is
  // never interpreted as HTML (defense-in-depth — the path is
  // already validated as a same-origin absolute path).
  const msg = note.querySelector<HTMLElement>('.auth-alert__msg');
  if (msg) {
    msg.append('You need an account to open ');
    const strong = document.createElement('strong');
    strong.textContent = dest;
    msg.append(strong, '. We will take you back there after you sign in.');
  }
  // Insert above any existing alert / demo banner so it's the first
  // thing the user sees inside the form.
  form.insertBefore(note, form.firstChild);
}

/** Map a known protected path to a short human label for the banner. */
function describeNextPath(path: string): string {
  const known: Record<string, string> = {
    '/student/find-work': 'Find work',
    '/student/dashboard': 'your student dashboard',
    '/student/applications': 'your applications',
    '/student/profile': 'your student profile',
    '/student/settings': 'your student settings',
    '/student/earnings': 'your earnings',
    '/student/reviews': 'your reviews',
    '/company/dashboard': 'your company dashboard',
    '/company/applicants': 'your applicants',
    '/company/hires': 'your hires',
    '/company/profile': 'your company profile',
    '/company/billing': 'your billing',
    '/company/settings': 'your company settings',
    '/jobs/post': 'Post a brief',
  };
  if (known[path]) return known[path];
  // Brief detail (e.g. /jobs/abc123) — fall back to a friendly generic.
  if (path.startsWith('/jobs/') && path !== '/jobs/post') return 'that brief';
  return path;
}

/** Pre-fill demo credentials on the auth pages to make testing painless.
 *  No-op: demo fill removed — the demo banner was deleted from login/signup
 *  and we don't surface seeded accounts on the auth pages anymore.
 */
function attachDemoFill(_form: HTMLFormElement, _kind: FormContext['kind']) {
  return;
}

export function mountAuthForms() {
  const forms = document.querySelectorAll<HTMLFormElement>('[data-auth-form]');
  forms.forEach((form) => {
    const kind = (form.getAttribute('data-auth-form') as FormContext['kind']) || 'login';
    // Pre-fill email from ?email=… so the CTA form deep-links here.
    try {
      const url = new URL(window.location.href);
      const incoming = url.searchParams.get('email');
      if (incoming) {
        const emailField = form.querySelector<HTMLInputElement>('[data-field="email"]');
        if (emailField && !emailField.value) emailField.value = incoming;
      }
    } catch {
      // ignore
    }
    attachPasswordToggles(form);
    attachAccountType(form);
    attachStrengthMeter(form);
    attachLiveValidation(form);
    attachGoogleStub(form);
    attachNextNotice(form, kind);
    if (kind === 'forgot') attachForgotFlow(form);
    attachSubmit(form, kind);
  });
}
