/**
 * contact-form
 *
 * Lightweight client wiring for /contact. Validates inputs and shows
 * a success card on submit. No network call — the form just simulates
 * latency and shows the success state. The "Send" payload would be
 * POSTed to a real endpoint in production.
 */

const VALIDATORS: Record<string, (value: string) => string | null> = {
  name(value) {
    if (!value.trim()) return 'Enter your name.';
    if (value.trim().length < 2) return 'Name looks too short.';
    return null;
  },
  email(value) {
    if (!value.trim()) return 'Enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return 'Enter a valid email address.';
    return null;
  },
  topic(value) {
    if (!value) return 'Pick a topic.';
    return null;
  },
  message(value) {
    const v = value.trim();
    if (!v) return 'Add a short message.';
    if (v.length < 20) return `Add at least 20 characters (currently ${v.length}).`;
    if (v.length > 2000) return 'Keep the message under 2000 characters.';
    return null;
  },
};

function setFieldError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  const wrap = field.closest('.ds-field');
  if (!wrap) return;
  wrap.querySelectorAll('.ds-field__error[data-contact-error]').forEach((n) => n.remove());
  const input = wrap.querySelector<HTMLElement>('.ds-input');
  if (input) input.classList.toggle('ds-input--error', Boolean(message));
  if (message) {
    const p = document.createElement('p');
    p.className = 'ds-field__error';
    p.setAttribute('data-contact-error', '');
    p.setAttribute('role', 'alert');
    p.textContent = message;
    wrap.appendChild(p);
  }
}

function setFormAlert(alertEl: HTMLElement | null, message: string | null, title = 'Please review the form.', variant?: 'success' | 'error') {
  if (!alertEl) return;
  if (!message) {
    alertEl.setAttribute('hidden', '');
    alertEl.classList.remove('alert--success', 'alert--error');
    return;
  }
  alertEl.removeAttribute('hidden');
  alertEl.classList.toggle('alert--success', variant === 'success');
  alertEl.classList.toggle('alert--error', variant === 'error');
  const titleEl = alertEl.querySelector<HTMLElement>('[data-form-alert-title]');
  const msgEl = alertEl.querySelector<HTMLElement>('[data-form-alert-msg]');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
}

function validateForm(form: HTMLFormElement): string | null {
  let firstInvalid: HTMLElement | null = null;
  let firstMessage = '';
  form.querySelectorAll<HTMLElement>('[data-field]').forEach((fieldEl) => {
    const name = fieldEl.getAttribute('data-field') || '';
    const value = (fieldEl as HTMLInputElement | HTMLTextAreaElement).value || '';
    const validator = VALIDATORS[name];
    const error = validator ? validator(value) : null;
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
    label.textContent = loading ? 'Sending…' : (label.dataset.original ?? 'Send message');
  }
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button, select, textarea').forEach((el) => {
    el.toggleAttribute('disabled', loading);
  });
}

export function mountContactForm() {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = validateForm(form);
    if (error) {
      setFormAlert(form.querySelector<HTMLElement>('[data-form-alert]'), error);
      return;
    }
    setLoading(form, true);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(form, false);
    const page = document.querySelector<HTMLElement>('.ct-page');
    const success = document.querySelector<HTMLElement>('[data-success-state]');
    if (page) page.setAttribute('hidden', '');
    if (success) success.removeAttribute('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
