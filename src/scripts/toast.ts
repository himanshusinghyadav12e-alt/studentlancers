/**
 * toast
 *
 * Tiny toast notification utility. Bind once per page and call
 * `toast.show({...})` from anywhere. The root element is rendered by
 * the layouts as `<div data-toast-root>`.
 *
 * Usage:
 *   import { toast } from './toast';
 *   toast.success('Brief published', 'BR-A12345');
 *   toast.error('Could not load applicants', 'Please try again.');
 *   toast.show({ title: 'Saved', message: '…', variant: 'info', durationMs: 4000 });
 */

export type ToastVariant = 'info' | 'success' | 'error';

interface ToastInput {
  title: string;
  message?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Default 4500. 0 = sticky. */
  durationMs?: number;
}

const ICONS: Record<ToastVariant, string> = {
  info: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.9" fill="currentColor"/></svg>`,
  success: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10.5l2.5 2.5L14 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  error: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.9" fill="currentColor"/></svg>`,
};

function getRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.querySelector<HTMLElement>('[data-toast-root]');
  if (!root) {
    // Defensive — if the layout didn't render one, build one on demand.
    root = document.createElement('div');
    root.className = 'sl-toast-root';
    root.setAttribute('data-toast-root', '');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(root);
  }
  return root;
}

function show(input: ToastInput): () => void {
  const root = getRoot();
  if (!root) return () => {};

  const variant: ToastVariant = input.variant ?? 'info';
  const el = document.createElement('div');
  el.className = `sl-toast sl-toast--${variant}`;
  el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="sl-toast__icon">${ICONS[variant]}</span>
    <div class="sl-toast__body">
      <p class="sl-toast__title"></p>
      ${input.message ? '<p class="sl-toast__msg"></p>' : ''}
    </div>
    <button type="button" class="sl-toast__close" aria-label="Dismiss notification">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  `;
  const titleEl = el.querySelector<HTMLElement>('.sl-toast__title');
  if (titleEl) titleEl.textContent = input.title;
  if (input.message) {
    const msgEl = el.querySelector<HTMLElement>('.sl-toast__msg');
    if (msgEl) msgEl.textContent = input.message;
  }
  root.appendChild(el);
  // Force a paint frame before adding the visible class so the
  // fade-in transition runs.
  requestAnimationFrame(() => el.classList.add('is-visible'));

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.classList.remove('is-visible');
    window.setTimeout(() => {
      el.remove();
    }, 220);
  };
  el.querySelector<HTMLButtonElement>('.sl-toast__close')?.addEventListener('click', remove);

  const duration = input.durationMs ?? 4500;
  if (duration > 0) {
    window.setTimeout(remove, duration);
  }
  return remove;
}

export const toast = {
  show,
  info(title: string, message?: string, durationMs?: number) {
    return show({ title, message, variant: 'info', durationMs });
  },
  success(title: string, message?: string, durationMs?: number) {
    return show({ title, message, variant: 'success', durationMs });
  },
  error(title: string, message?: string, durationMs?: number) {
    return show({ title, message, variant: 'error', durationMs });
  },
};
