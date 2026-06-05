/**
 * auth-form
 *
 * Client-side wiring for the auth pages. Wires:
 *   - Password show/hide toggle (multiple per page)
 *   - Account type radio visual sync
 *   - Inline validation + form-level alerts
 *   - Password strength meter
 *   - Submission loading state
 *   - Forgot-password success state + resend
 *
 * No real network calls — all submissions are intercepted and resolve
 * to a deterministic outcome so the UI is exercised end-to-end. Wiring
 * the real API is a one-liner inside `submitForm`.
 */

interface FormContext {
  form: HTMLFormElement;
  kind: 'login' | 'signup' | 'forgot';
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
  // The terms checkbox lives inside a <label class="auth-check">,
  // not a .ds-field. Find the closest container that hosts the
  // error UI; fall back to the field's parent otherwise.
  const fieldEl =
    (field.closest('.ds-field') as HTMLElement | null) ??
    (field.closest('[data-terms]') as HTMLElement | null) ??
    (field.closest('label') as HTMLElement | null);
  if (!fieldEl) return;

  // Remove any previous error
  fieldEl.querySelectorAll('.ds-field__error[data-auth-error]').forEach((n) => n.remove());

  // Toggle native input error styling on text inputs only
  const input = fieldEl.querySelector<HTMLInputElement>('.ds-input');
  if (input) {
    input.classList.toggle('ds-input--error', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  // For the custom checkbox, mark the visible box red
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

function setFormAlert(alertEl: HTMLElement | null, message: string | null, title = 'Something went wrong.') {
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
    input.addEventListener('focus', () => {
      // Soft highlight when focus enters via keyboard
      choice.classList.add('is-focused');
    });
    input.addEventListener('blur', () => {
      choice.classList.remove('is-focused');
    });
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

function setLoading(form: HTMLFormElement, loading: boolean) {
  const submit = form.querySelector<HTMLElement>('[data-submit]');
  const label = form.querySelector<HTMLElement>('[data-submit-label]');
  if (submit) submit.setAttribute('data-loading', loading ? 'true' : 'false');
  if (label && submit instanceof HTMLButtonElement) {
    // Preserve original label for non-button submit (link styled as button)
    if (!label.dataset.original) {
      label.dataset.original = label.textContent ?? '';
    }
    label.textContent = loading ? 'Working…' : (label.dataset.original ?? label.textContent ?? '');
  }
  form.querySelectorAll<HTMLInputElement>('input, button, select, textarea').forEach((el) => {
    if (el instanceof HTMLButtonElement && el.hasAttribute('data-password-toggle')) return;
    el.toggleAttribute('disabled', loading);
  });
}

/**
 * Mock async submission. Replace with a real API call when wiring the
 * backend. Throws on simulated failure so the form-level alert path is
 * exercised; resolved promise triggers the success path for the
 * forgot-password form.
 */
async function submitForm(_ctx: FormContext, _data: FormData): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return { ok: true, email: String(_data.get('email') ?? '') };
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
    // Move focus to the success heading for screen reader users
    const heading = successState.querySelector<HTMLElement>('.auth-success__title');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  });

  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      setLoading(form, true);
      await new Promise((r) => setTimeout(r, 500));
      setLoading(form, false);
      resendBtn.textContent = 'Resent ✓';
      window.setTimeout(() => {
        resendBtn.textContent = 'Didn’t get it? Resend';
      }, 2400);
    });
  }
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

    // Capture the form data BEFORE disabling inputs — disabled form
    // controls are excluded from FormData, which would drop the email
    // value the success state echoes back to the user.
    const data = new FormData(form);
    setLoading(form, true);
    try {
      const result = await submitForm({ form, kind }, data);
      if (!result.ok) {
        setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), result.message);
        return;
      }
      if (kind === 'forgot') {
        form.dispatchEvent(new CustomEvent('auth:success', { detail: { email: result.email } }));
      } else if (kind === 'login') {
        // In a real app, redirect to dashboard. For now, show a success hint.
        const alert = form.querySelector<HTMLElement>('[data-form-alert]');
        if (alert) {
          alert.classList.add('auth-alert--success');
          setFormAlert(alert, 'Signed in. Redirecting…', 'Welcome back.');
        }
      } else if (kind === 'signup') {
        const alert = form.querySelector<HTMLElement>('[data-form-alert]');
        if (alert) {
          alert.classList.add('auth-alert--success');
          setFormAlert(alert, 'Account created. Check your email to verify.', 'Welcome aboard.');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), message);
    } finally {
      setLoading(form, false);
    }
  });
}

function attachLiveValidation(form: HTMLFormElement) {
  form.querySelectorAll<HTMLInputElement>('[data-field]').forEach((fieldEl) => {
    if (!(fieldEl instanceof HTMLInputElement)) return;
    const name = fieldEl.getAttribute('data-field') || '';
    if (!name) return;
    const handler = () => {
      // Only re-validate fields that are already showing an error so the
      // form doesn't yell at users mid-typing.
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

export function mountAuthForms() {
  const forms = document.querySelectorAll<HTMLFormElement>('[data-auth-form]');
  forms.forEach((form) => {
    const kind = (form.getAttribute('data-auth-form') as FormContext['kind']) || 'login';
    attachPasswordToggles(form);
    attachAccountType(form);
    attachStrengthMeter(form);
    attachLiveValidation(form);
    attachGoogleStub(form);
    if (kind === 'forgot') attachForgotFlow(form);
    attachSubmit(form, kind);
  });
}
